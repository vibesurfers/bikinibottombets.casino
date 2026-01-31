import { Resend } from 'resend';
import { config, isTestMode } from '../config.js';
const client = config.RESEND_API_KEY
    ? new Resend(config.RESEND_API_KEY)
    : null;
export async function sendEmail(params) {
    // Test mode - simulate email
    if (isTestMode || !client) {
        console.log(`[TEST MODE] Would send email to ${params.to}: ${params.subject}`);
        return {
            id: `test-email-${Date.now()}`,
            success: true,
        };
    }
    const { data, error } = await client.emails.send({
        from: 'Active Investor <onboarding@resend.dev>', // Use Resend's test domain
        to: params.to,
        subject: params.subject,
        html: params.html,
        reply_to: params.replyTo,
    });
    if (error) {
        throw new Error(`Resend failed: ${error.message}`);
    }
    return {
        id: data.id,
        success: true,
    };
}
// Email templates for different campaign types
export function irOutreachTemplate(company, question) {
    return `
    <p>Dear Investor Relations Team,</p>
    <p>I am conducting research on ${company} and would appreciate your assistance with the following inquiry:</p>
    <p>${question}</p>
    <p>Thank you for your time and consideration.</p>
    <p>Best regards,<br/>Active Investor Research</p>
  `;
}
export function foiaRequestTemplate(agency, request) {
    return `
    <p>Dear FOIA Officer,</p>
    <p>Pursuant to the Freedom of Information Act, I am requesting the following records:</p>
    <p>${request}</p>
    <p>Please contact me if you require any clarification.</p>
    <p>Sincerely,<br/>Active Investor Research</p>
  `;
}
export function shareholderLetterTemplate(company, message) {
    return `
    <p>Dear Board of Directors,</p>
    <p>As a concerned stakeholder in ${company}, I am writing to express the following:</p>
    <p>${message}</p>
    <p>I look forward to your response.</p>
    <p>Sincerely,<br/>Active Investor Collective</p>
  `;
}
