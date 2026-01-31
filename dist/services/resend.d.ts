export interface EmailParams {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
}
export interface EmailResult {
    id: string;
    success: boolean;
}
export declare function sendEmail(params: EmailParams): Promise<EmailResult>;
export declare function irOutreachTemplate(company: string, question: string): string;
export declare function foiaRequestTemplate(agency: string, request: string): string;
export declare function shareholderLetterTemplate(company: string, message: string): string;
