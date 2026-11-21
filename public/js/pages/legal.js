// Terms and Privacy pages. Plain-language defaults written for how the product actually works.
// They are not legal advice: have a lawyer in your country review them before you go live.
import { h } from '../ui.js';
import { SUPPORT_EMAIL, BUSINESS_NAME } from '../config.js';

const UPDATED = '20 November 2026';
const contact = () => (SUPPORT_EMAIL ? h('a', { href: `mailto:${SUPPORT_EMAIL}` }, SUPPORT_EMAIL) : 'the support contact shown on our website');

function doc(title, sections) {
  return h('div', { class: 'container section legal' },
    h('h1', null, title), h('p', { class: 'muted' }, `Last updated ${UPDATED}`),
    sections.map(([head, ...paras]) => h('section', null, h('h2', null, head), paras.map((p) => (Array.isArray(p) ? h('ul', null, p.map((li) => h('li', null, li))) : h('p', null, p))))),
    h('p', { class: 'muted small' }, 'Questions about this page? Contact ', contact(), '.'));
}

export const termsPage = () => doc('Terms of Service', [
  ['Who we are', `${BUSINESS_NAME} lets you build a resume and cover letters from one profile, check them against a job description, and get a verifiable document ID. By creating an account or using the site you agree to these terms.`],
  ['Your account', 'Give accurate details and keep your password private. You are responsible for what happens under your account. You must be at least 16 years old, or have a parent or guardian’s permission.'],
  ['Your content', 'Your profile, resumes and letters belong to you. You allow us to store and process them only to run the service for you, including sending the relevant text to Google’s Gemini AI service when you ask for AI writing. You promise that what you put in is true and that you have the right to use it.'],
  ['Document verification', 'A CV-Certify document ID shows that a document was issued from an account and has not been changed since. It is not a background check, and we do not confirm that the facts in it (employers, qualifications, dates) are true. Employers should confirm those with the source.'],
  ['AI writing', 'AI suggestions are drafts. They can contain mistakes. Read everything and correct anything that is not true before you send it. You are responsible for what you submit to employers.'],
  ['Free to use', 'CV-Certify is free. There are no paid plans. To keep AI writing available to everyone, there is a monthly fair-use limit on AI actions per account; everything else is unlimited. We may change or limit features in future and will tell you on the site if we do.'],
  ['What you must not do', ['Use someone else’s identity or invent qualifications or work history.', 'Try to break, overload or reverse-engineer the service, or access other people’s data.', 'Use the service for anything unlawful.']],
  ['Ending things', 'You can delete your CV-Certify data at any time from the Account page. We may suspend an account that breaks these terms. If we stop offering the service, we will give notice where we reasonably can.'],
  ['Liability', 'We work hard to keep the service reliable but provide it “as is”. We are not responsible for lost job opportunities or for losses that come from content you submitted. Nothing here limits rights you have under the law that cannot be limited.'],
  ['Changes', 'We may update these terms. If a change matters, we will tell you on the site. Using the service after a change means you accept it.'],
]);

export const privacyPage = () => doc('Privacy Policy', [
  ['What we collect', ['Account details: your name, email address and a hashed password (or a Google sign-in identifier).', 'What you add: your profile, resumes, cover letters, job descriptions you paste, and your portfolio settings.', 'Visit statistics: a random ID stored in your browser, the page visited and the website that sent you. No cookies, and no IP address is stored. If your browser sends “Do Not Track”, we do not count your visit.']],
  ['How we use it', 'To run your account, produce and verify documents, prevent abuse, and understand in general terms how the site is used. We do not sell your data and we do not show advertising.'],
  ['Who else handles it', ['Supabase hosts our database and sign-in.', 'Google (Gemini API) receives the text of the profile or job description you ask the AI to work on, only when you use an AI feature. We use Google’s free tier, under which Google may use that content to improve its products, so do not paste anything you would not want shared that way (for example ID numbers or other people’s private details). If the AI service is busy or unavailable, a built-in writer that runs on our own servers is used instead.', 'GitHub hosts the website files.']],
  ['What a document ID reveals', 'Anyone with a document ID can see the details of that document on the verification page, such as your name, headline and the facts in the certified version. Revoke a document from your dashboard at any time to stop it verifying. Public portfolios are visible to anyone with the link while they are switched on.'],
  ['How long we keep it', 'Until you delete it. “Delete my data” on the Account page removes your profile, resumes, letters and portfolio, and revokes your document IDs.'],
  ['Your rights', 'You can see, correct and delete your data in the app. If you are in Uganda, the Data Protection and Privacy Act, 2019 gives you rights over your personal data. If you are elsewhere, the law where you live may give you similar rights. Contact us to use them.'],
  ['Security', 'Data is stored with encryption in transit, and access rules in the database stop one user from reading another’s data. No system is perfectly secure, so use a strong, unique password.'],
]);
