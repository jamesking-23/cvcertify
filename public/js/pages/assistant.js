import { h, icon, clear, toast, setBusy } from '../ui.js';
import { post } from '../api.js';
import { state } from '../main.js';

const STARTERS = ['How can I make my summary stronger?', 'What should I say when asked about a career gap?', 'Help me answer “Tell me about yourself”.', 'What salary should I ask for in my first role?'];

export default function assistantPage() {
  const history = [];
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const input = h('textarea', { class: 'textarea', rows: 2, style: 'min-height:48px', placeholder: 'Ask about your resume, interviews or job search…', 'aria-label': 'Message' });
  const send = h('button', { class: 'btn btn-primary', 'aria-label': 'Send' }, icon('send'));

  const add = (role, text) => { const b = h('div', { class: `bubble ${role === 'user' ? 'me' : 'bot'}` }, text); log.append(b); log.scrollTop = log.scrollHeight; return b; };

  const ask = async (text) => {
    text = text.trim();
    if (!text) return;
    input.value = '';
    clear(starters);
    add('user', text);
    const pending = add('bot', 'Thinking…');
    send.disabled = true;
    try {
      const out = await post('/ai/assistant', { message: text, history: history.slice(-8) });
      pending.textContent = out.reply;
      history.push({ role: 'user', text }, { role: 'assistant', text: out.reply });
    } catch (e) {
      pending.remove();
      toast(e.message, 'error');
    }
    send.disabled = false;
    input.focus();
  };
  send.onclick = () => ask(input.value);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });

  const starters = h('div', { class: 'row row-wrap', style: 'margin-bottom:12px' }, STARTERS.map((s) => h('button', { class: 'chip chip-brand', style: 'padding:7px 12px;cursor:pointer', onclick: () => ask(s) }, s)));
  add('assistant', `Hi ${state.user.name.split(' ')[0]}, I can see your master profile. What are you working on?`);

  return h('div', { style: 'max-width:780px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'AI assistant'), h('p', null, 'A career coach that knows your profile.'))),
    !state.config.ai && h('div', { class: 'alert alert-warn', style: 'margin-bottom:16px' }, icon('alert'), 'The assistant needs an AI key to be configured on this server.'),
    h('div', { class: 'card chat' }, log, starters, h('div', { class: 'row', style: 'align-items:flex-end' }, h('div', { class: 'grow' }, input), send)));
}
