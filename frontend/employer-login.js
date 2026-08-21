const form = document.querySelector('#employer-login-form');
const email = document.querySelector('#work-email');
const password = document.querySelector('#employer-login-password');
const reveal = document.querySelector('#reveal-password');
const message = document.querySelector('.login-message');
const signInButton = document.querySelector('.sign-in-button');
const notice = document.querySelector('.notice');
const forgotLink = document.querySelector('#forgot-link');
const resetModal = document.querySelector('#reset-modal');
const resetForm = document.querySelector('#reset-form');
const closeReset = document.querySelector('.close-reset');
let noticeTimer;
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = isLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';

const showNotice = (title, detail) => {
  notice.querySelector('b').textContent = title;
  notice.querySelector('small').textContent = detail;
  notice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('show'), 3000);
};

reveal.addEventListener('click', () => {
  const hidden = password.type === 'password';
  password.type = hidden ? 'text' : 'password';
  reveal.textContent = hidden ? 'Hide' : 'Show';
  reveal.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
});

form.addEventListener('input', (event) => {
  event.target.classList.remove('invalid');
  message.classList.remove('show');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = [email, password];
  let valid = true;

  fields.forEach((field) => {
    const fieldValid = field.checkValidity();
    field.classList.toggle('invalid', !fieldValid);
    if (!fieldValid) valid = false;
  });

  if (!valid) {
    message.textContent = 'Enter your registered work email and password to continue.';
    message.classList.add('show');
    fields.find((field) => !field.checkValidity())?.focus();
    return;
  }

  signInButton.disabled = true;
  signInButton.textContent = 'Verifying employer account…';

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value, accountType: 'employer' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Employer sign in failed.');

    sessionStorage.setItem('careerlyAccessToken', data.accessToken);
    if (form.elements.remember.checked) localStorage.setItem('careerlyEmployerEmail', email.value.trim());
    else localStorage.removeItem('careerlyEmployerEmail');

    signInButton.textContent = 'Employer account verified ✓';
    signInButton.style.background = '#3d315b';
    const verification = data.company?.verificationStatus;
    showNotice('Welcome back', verification === 'verified' ? 'Your verified hiring workspace is ready.' : `Company verification status: ${verification || 'pending'}.`);
    window.setTimeout(() => { window.location.href = 'employer-dashboard.html'; }, 850);
  } catch (error) {
    message.textContent = error.message === 'Failed to fetch' ? 'The Careerly server is unavailable.' : error.message;
    message.classList.add('show');
    signInButton.disabled = false;
    signInButton.innerHTML = 'Sign in to employer portal <span>→</span>';
  }
});

document.querySelectorAll('.sso-buttons button').forEach((button) => {
  button.addEventListener('click', () => {
    showNotice(`${button.dataset.provider} selected`, 'Secure workspace sign-in would continue here.');
  });
});

forgotLink.addEventListener('click', (event) => {
  event.preventDefault();
  resetModal.classList.add('open');
  const resetEmail = resetForm.querySelector('input');
  if (email.value && email.checkValidity()) resetEmail.value = email.value;
  resetEmail.focus();
});

const closeResetModal = () => resetModal.classList.remove('open');
closeReset.addEventListener('click', closeResetModal);
resetModal.addEventListener('click', (event) => {
  if (event.target === resetModal) closeResetModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && resetModal.classList.contains('open')) closeResetModal();
});

resetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!resetForm.checkValidity()) {
    resetForm.reportValidity();
    return;
  }
  const resetEmail = resetForm.querySelector('input').value;
  closeResetModal();
  resetForm.reset();
  showNotice('Reset link sent', `Check ${resetEmail} for secure instructions.`);
});

const rememberedEmail = localStorage.getItem('careerlyEmployerEmail');
if (rememberedEmail) {
  email.value = rememberedEmail;
  form.elements.remember.checked = true;
}
