const password = document.querySelector('#password');
const reveal = document.querySelector('.reveal');
const confirmPassword = document.querySelector('#confirm-password');
const confirmReveal = document.querySelector('.confirm-reveal');
const form = document.querySelector('#signup-form');
const message = document.querySelector('.signup-message');
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = isLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';

reveal.addEventListener('click', () => {
  const hidden = password.type === 'password';
  password.type = hidden ? 'text' : 'password';
  reveal.textContent = hidden ? 'Hide' : 'Show';
  reveal.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
});

confirmReveal.addEventListener('click', () => {
  const hidden = confirmPassword.type === 'password';
  confirmPassword.type = hidden ? 'text' : 'password';
  confirmReveal.textContent = hidden ? 'Hide' : 'Show';
  confirmReveal.setAttribute('aria-label', hidden ? 'Hide confirmation password' : 'Show confirmation password');
});

const validatePasswordMatch = () => {
  const matches = password.value === confirmPassword.value;
  confirmPassword.setCustomValidity(matches ? '' : 'Passwords do not match.');
  return matches;
};

password.addEventListener('input', validatePasswordMatch);
confirmPassword.addEventListener('input', () => {
  validatePasswordMatch();
  message.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  if (!validatePasswordMatch()) {
    message.textContent = 'Both passwords must match before you can create your account.';
    confirmPassword.focus();
    return;
  }
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const button = form.querySelector('.continue');
  button.disabled = true;
  button.textContent = 'Creating your account…';

  try {
    const payload = {
      firstName: form.elements.firstName.value.trim(),
      lastName: form.elements.lastName.value.trim(),
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value,
    };
    const response = await fetch(`${apiBaseUrl}/api/job-seekers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Account creation failed.');

    sessionStorage.setItem('careerlyAccessToken', data.accessToken);
    button.textContent = 'Account created! Taking you to sign in…';
    button.style.background = '#3d315b';
    message.style.color = '#4f8d77';
    message.textContent = 'Registration successful. Redirecting to sign in…';
    window.setTimeout(() => { window.location.href = 'login.html?account=job_seeker&registered=1'; }, 900);
  } catch (error) {
    message.style.color = '#bf422c';
    message.textContent = error.message === 'Failed to fetch'
      ? 'The API server is not running. Open the site through http://localhost:3000 after starting the server.'
      : error.message;
    button.textContent = 'Create account →';
    button.style.background = '#b9442e';
    button.disabled = false;
  }
});
