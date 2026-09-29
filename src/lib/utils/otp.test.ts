import { describe, expect, it } from 'vitest';
import type { Email } from '$lib/jmap/types';
import { detectEmailVerificationCode, detectVerificationCode, htmlToText } from './otp';

function htmlEmail(subject: string, html: string): Email {
	return {
		id: 'e1',
		subject,
		htmlBody: [{ partId: '1', type: 'text/html' }],
		textBody: [{ partId: '1', type: 'text/html' }],
		bodyValues: { '1': { value: html } }
	} as unknown as Email;
}

const UDEMY = `
<table><tr><td><img src="https://www.udemy.com/logo.png" alt="Udemy"></td></tr>
<tr><td>
  <p>Hi Odai,</p>
  <p>Use the code below to log in to your Udemy account.</p>
  <a href="https://click.udemy.com/track?x=1"><div style="background:#f0f0f0;font-size:48px">504072</div></a>
  <p>This code expires in 15 minutes.</p>
  <p>Didn&#39;t request this code? <a href="https://udemy.com/support">Contact us</a>.</p>
  <p style="color:#999">Delivered by Udemy 600 Harrison Street, 3rd Floor, San Francisco, CA 94107.</p>
</td></tr></table>`;

describe('detectVerificationCode', () => {
	it('finds the Udemy login code, not the zip code in the footer', () => {
		expect(detectEmailVerificationCode(htmlEmail('Your Udemy login code', UDEMY))).toEqual({
			code: '504072',
			display: '504072'
		});
	});

	it('reads the code from the subject first', () => {
		expect(detectVerificationCode('504072 is your verification code', 'Hello, welcome back.')).toEqual({
			code: '504072',
			display: '504072'
		});
	});

	it('takes the digits from a prefixed code', () => {
		expect(detectVerificationCode('G-839201 is your Google verification code', '')?.code).toBe('839201');
	});

	it('keeps a grouped code readable but copies it without the space', () => {
		expect(
			detectVerificationCode('Sign in to Contoso', 'Your security code is 123 456. It expires in 10 minutes.')
		).toEqual({ code: '123456', display: '123 456' });
	});

	it('joins a code rendered one digit per table cell', () => {
		const html = `<p>Your one-time passcode:</p><table><tr><td>5</td><td>0</td><td>4</td><td>0</td><td>7</td><td>2</td></tr></table>`;
		expect(detectEmailVerificationCode(htmlEmail('Verify your sign-in', html))?.code).toBe('504072');
	});

	it('skips phone numbers and years near the code', () => {
		const body =
			'Your verification code is 839201.\nIf you did not request this, call (555) 123-4567.\n© 2026 Example Inc.';
		expect(detectVerificationCode('Account security', body)?.code).toBe('839201');
	});

	it('accepts an alphanumeric code only after an unambiguous phrase', () => {
		expect(
			detectVerificationCode('Confirm your email', 'Your verification code: X7K9PQ\nIt expires in 30 minutes.')
		).toEqual({ code: 'X7K9PQ', display: 'X7K9PQ' });
	});

	it('ignores a marketing email with a promo code and a zip code', () => {
		const body =
			'One-time offer! Use code SAVE20 at checkout. Log in to your account to see more.\n' +
			'Promo code 50OFF. Store: 600 Harrison Street, San Francisco, CA 94107.';
		expect(detectVerificationCode('Big sale this weekend', body)).toBeNull();
	});

	it('ignores an order confirmation', () => {
		const body =
			'Thanks for your order #12345678. Confirmation code: 4X9Q. Call 1-800-555-0199 with questions. ' +
			'Estimated delivery 2026-10-02.';
		expect(detectVerificationCode('Your order is confirmed', body)).toBeNull();
	});

	it('does not invent a code when a verification email has none', () => {
		expect(
			detectVerificationCode('Verify your email address', 'Click the link below to verify your email. It expires in 24 hours.')
		).toBeNull();
	});

	it('falls back to the HTML when the text part has no code', () => {
		const email = {
			id: 'e2',
			subject: 'Your login code',
			textBody: [{ partId: 't', type: 'text/plain' }],
			htmlBody: [{ partId: 'h', type: 'text/html' }],
			bodyValues: {
				t: { value: 'View this email in your browser.' },
				h: { value: '<p>Your login code is <b>771204</b>. It expires in 10 minutes.</p>' }
			}
		} as unknown as Email;
		expect(detectEmailVerificationCode(email)?.code).toBe('771204');
	});
});

describe('htmlToText', () => {
	it('drops styles, comments and tags, and decodes entities', () => {
		expect(
			htmlToText('<style>p{color:red}</style><!-- x --><p>Hi&nbsp;there &amp; you</p><p>Code: 1</p>')
		).toBe('Hi there & you\nCode: 1');
	});
});
