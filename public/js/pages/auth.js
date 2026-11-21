import { h, icon, setBusy, toast, clear } from '../ui.js';
import { post } from '../api.js';
import { auth } from '../supabase-lite.js';
import { state, navigate, setUser, logo } from '../main.js';

const safeNext = (q) => {
  const n = q.get('next');
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/app';
};

function passwordField(id, label, autocomplete, placeholder) {
  const input = h('input', { id, class: 'input', type: 'password', autocomplete, placeholder, required: true });
  const tog = h('button', { type: 'button', class: 'toggle', 'aria-label': 'Show password', 'aria-pressed': 'false', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    tog.setAttribute('aria-pressed', show);
    tog.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    tog.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  } }, icon('eye'));
  return { input, node: h('div', { class: 'field' }, h('label', { for: id }, label), h('div', { class: 'input-wrap' }, input, tog)) };
}

const textField = (id, label, type, autocomplete, placeholder) => {
  const input = h('input', { id, class: 'input', type, autocomplete, placeholder, required: true });
  return { input, node: h('div', { class: 'field' }, h('label', { for: id }, label), input) };
};

function googleButton() {
  // Google sign-in goes through Supabase Auth (OAuth redirect). It is shown only if the project has Google enabled.
  if (!state.config.google) return null;
  return h('button', { type: 'button', class: 'btn btn-outline btn-block', onclick: () => { location.href = auth.googleUrl(); } }, 'Continue with Google');
}

function shell(title, sub, ...rest) {
  return h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card fade-up' }, logo(), h('h1', null, title), h('p', { class: 'muted' }, sub), h('div', { class: 'stack', style: 'margin-top:24px' }, ...rest)));
}

const errorBox = () => h('div', { class: 'alert alert-error', role: 'alert', hidden: true });
const showError = (box, msg) => { box.textContent = msg; box.hidden = !msg; };

export function loginPage({ query }) {
  const email = textField('email', 'Email', 'email', 'email', 'you@example.com');
  const pw = passwordField('password', 'Password', 'current-password', '••••••••');
  const err = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', style: 'height:46px', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    showError(err, '');
    setBusy(submit, true, 'Signing in…');
    try {
      const { user } = await post('/auth/login', { email: email.input.value, password: pw.input.value });
      setUser(user);
      navigate(safeNext(query));
    } catch (ex) {
      showError(err, ex.message);
      setBusy(submit, false);
    }
  } }, err, email.node, pw.node, submit, h('a', { href: '/forgot', class: 'small', style: 'text-decoration:underline' }, 'Forgot password?'));
  return shell('Welcome back', 'Sign in to continue building your career profile.', form, googleButton() && h('div', { class: 'divider' }, 'or continue with'), googleButton(),
    h('p', { class: 'center muted small' }, 'New to CV-Certify? ', h('a', { href: '/signup', style: 'font-weight:600;color:var(--ink-950)' }, 'Create an account')));
}

export function signupPage({ query }) {
  const name = textField('name', 'Full name', 'text', 'name', 'Jane Doe');
  const email = textField('email', 'Email', 'email', 'email', 'you@example.com');
  const pw = passwordField('password', 'Password', 'new-password', 'At least 8 characters');
  const err = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', style: 'height:46px', type: 'submit' }, 'Create account');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    showError(err, '');
    if (pw.input.value.length < 8) return showError(err, 'Password must be at least 8 characters.');
    setBusy(submit, true, 'Creating account…');
    try {
      const out = await post('/auth/signup', { name: name.input.value, email: email.input.value, password: pw.input.value });
      if (out.confirm) {
        clear(form).append(h('div', { class: 'alert alert-info' }, icon('check'), h('div', null, h('strong', null, 'Check your inbox. '), `We sent a confirmation link to ${email.input.value.trim()}. Open it to finish creating your account, then sign in.`)), h('a', { class: 'btn btn-outline btn-block', href: '/login' }, 'Go to sign in'));
        return;
      }
      setUser(out.user);
      navigate('/app/profile');
    } catch (ex) {
      showError(err, ex.message);
      setBusy(submit, false);
    }
  } }, err, name.node, email.node, pw.node, submit, h('p', { class: 'muted small center' }, 'By creating an account you agree to our ', h('a', { href: '/terms' }, 'Terms'), ' and ', h('a', { href: '/privacy' }, 'Privacy Policy'), '.'));
  return shell('Create your account', 'One profile. Every career document you’ll ever need.', form, googleButton() && h('div', { class: 'divider' }, 'or continue with'), googleButton(),
    h('p', { class: 'center muted small' }, 'Already have an account? ', h('a', { href: '/login', style: 'font-weight:600;color:var(--ink-950)' }, 'Sign in')));
}

export function forgotPage() {
  const email = textField('email', 'Email', 'email', 'email', 'you@example.com');
  const err = errorBox();
  const ok = h('div', { class: 'alert alert-info', hidden: true }, 'If an account exists for that email, a reset link is on its way. The link signs you in so you can choose a new password.');
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Send reset link');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    showError(err, '');
    setBusy(submit, true, 'Sending…');
    try { await post('/auth/forgot', { email: email.input.value }); ok.hidden = false; } catch (ex) { showError(err, ex.message); }
    setBusy(submit, false);
  } }, err, ok, email.node, submit);
  return shell('Reset your password', 'We’ll email you a link to choose a new one.', form, h('p', { class: 'center small' }, h('a', { href: '/login', style: 'text-decoration:underline' }, 'Back to sign in')));
}

export function resetPage() {
  const token = auth.hasSession(); // the emailed link signs the user in with a short-lived recovery session
  const pw = passwordField('password', 'New password', 'new-password', 'At least 8 characters');
  const err = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save new password');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    showError(err, '');
    setBusy(submit, true, 'Saving…');
    try {
      const { user } = await post('/auth/reset', { password: pw.input.value });
      setUser(user);
      toast('Password updated. You are signed in.');
      navigate('/app');
    } catch (ex) { showError(err, ex.message); setBusy(submit, false); }
  } }, err, pw.node, submit);
  if (!token) return shell('Link not valid', 'This reset link is missing or has expired.', h('a', { href: '/forgot', class: 'btn btn-primary' }, 'Request a new link'));
  return shell('Choose a new password', 'Pick something you haven’t used elsewhere.', form);
}
