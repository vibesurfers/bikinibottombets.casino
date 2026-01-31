import { Resend } from 'resend';

const resend = new Resend('re_U46KWSNR_EiieFHiZSpc4R9o7umTU4FqN');

async function testResendAPI() {
  console.log('Testing Resend API integration...\n');

  try {
    const { data, error } = await resend.emails.send({
      from: 'Test <onboarding@resend.dev>',
      to: ['delivered@resend.dev'],
      subject: 'Active Investor API Test',
      text: 'Testing Resend integration for Active Investor platform',
    });

    if (error) {
      console.error('Error sending email:');
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log('Email sent successfully!');
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Exception occurred:');
    console.error(err);
    process.exit(1);
  }
}

testResendAPI();
