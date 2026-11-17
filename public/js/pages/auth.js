import { h, icon, setBusy, toast } from '../ui.js';
import { post } from '../api.js';
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
  const holder = h('div', { class: 'stack-sm' });
  const clientId = state.config.google;
  const btn = h('button', { type: 'button', class: 'btn btn-outline btn-block', onclick: () => {
    if (!clientId) return toast('Google sign-in is not set up on this server yet. Use email and password for now.', 'error');
  } }, 'Continue with Google');
  holder.append(btn);
  if (clientId) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      window.google.accounts.id.initialize({ client_id: clientId, callback: async ({ credential }) => {
        try {
          const { user } = await post('/auth/google', { credential });
          setUser(user);
          navigate(safeNext(new URLSearchParams(location.search)));
        } catch (e) { toast(e.message, 'error'); }
      } });
      btn.onclick = () => window.google.accounts.id.prompt();
    };
    document.head.append(s);
  }
  return holder;
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
  return shell('Welcome back', 'Sign in to continue building your career profile.', form, h('div', { class: 'divider' }, 'or continue with'), googleButton(),
    h('p', { class: 'center muted small' }, 'New to CV-Certify? ', h('a', { href: '/signup' + (query.get('plan') ? '?plan=' + query.get('plan') : ''), style: 'font-weight:600;color:var(--ink-950)' }, 'Create an account')));
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
      const { user } = await post('/auth/signup', { name: name.input.value, email: email.input.value, password: pw.input.value });
      setUser(user);
      const plan = query.get('plan');
      navigate(plan && plan !== 'starter' ? '/app/account#plans' : '/app/profile');
    } catch (ex) {
      showError(err, ex.message);
      setBusy(submit, false);
    }
  } }, err, name.node, email.node, pw.node, submit);
  return shell('Create your account', 'One profile. Every career document you’ll ever need.', form, h('div', { class: 'divider' }, 'or continue with'), googleButton(),
    h('p', { class: 'center muted small' }, 'Already have an account? ', h('a', { href: '/login', style: 'font-weight:600;color:var(--ink-950)' }, 'Sign in')));
}

export function forgotPage() {
  const email = textField('email', 'Email', 'email', 'email', 'you@example.com');
  const err = errorBox();
  const ok = h('div', { class: 'alert alert-info', hidden: true }, 'If an account exists for that email, a reset link is on its way. It expires in 1 hour.');
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

export function resetPage({ query }) {
  const token = query.get('token');
  const pw = passwordField('password', 'New password', 'new-password', 'At least 8 characters');
  const err = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save new password');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    showError(err, '');
    setBusy(submit, true, 'Saving…');
    try {
      const { user } = await post('/auth/reset', { token, password: pw.input.value });
      setUser(user);
      toast('Password updated. You are signed in.');
      navigate('/app');
    } catch (ex) { showError(err, ex.message); setBusy(submit, false); }
  } }, err, pw.node, submit);
  if (!token) return shell('Link not valid', 'This reset link is missing its token.', h('a', { href: '/forgot', class: 'btn btn-primary' }, 'Request a new link'));
  return shell('Choose a new password', 'Pick something you haven’t used elsewhere.', form);
}
