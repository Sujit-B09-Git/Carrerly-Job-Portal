const form = document.querySelector('#login-form');
const password = document.querySelector('#login-password');
const reveal = document.querySelector('.reveal');
const message = document.querySelector('.form-message');
const accountButtons = document.querySelectorAll('.account-type-card');
const signupLink = document.querySelector('#signup-link');
const signupLinkText = document.querySelector('#signup-link-text');
const roleSignupLink = document.querySelector('#role-signup-link');
const loginKicker = document.querySelector('#login-kicker');
const loginTitle = document.querySelector('#login-title');
const loginSubheading = document.querySelector('#login-subheading');
const googleLabel = document.querySelector('#google-label');
const secondSocialLabel = document.querySelector('#second-social-label');
const secondSocialIcon = document.querySelector('#second-social-icon');
const signinButtonText = document.querySelector('#signin-button-text');
let selectedAccountType = 'job_seeker';
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = isLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';

const accountContent = {
  job_seeker: {
    signupHref: 'candidate-registration.html',
    signupText: 'Create a job seeker account',
    roleSignupText: 'Create your job seeker account →',
    kicker: 'Welcome back',
    title: 'Sign in to Careerly',
    subheading: 'Your next opportunity could be one click away.',
    google: 'Continue with Google',
    second: 'Continue with LinkedIn',
    secondIcon: 'in',
    button: 'Sign in as job seeker',
  },
  employer: {
    signupHref: 'employer-registration.html',
    signupText: 'Register your company',
    roleSignupText: 'Register your company to start hiring →',
    kicker: 'Careerly for employers',
    title: 'Sign in to your hiring workspace',
    subheading: 'Manage jobs, candidates, and every hiring conversation.',
    google: 'Google Workspace',
    second: 'Continue with Microsoft',
    secondIcon: 'M',
    button: 'Sign in as employer',
  },
};

const setAccountType = (type) => {
  selectedAccountType = type;
  const content = accountContent[type];
  accountButtons.forEach((button) => {
    const active = button.dataset.accountType === type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  signupLink.href = content.signupHref;
  signupLinkText.textContent = content.signupText;
  roleSignupLink.href = content.signupHref;
  roleSignupLink.textContent = content.roleSignupText;
  loginKicker.textContent = content.kicker;
  loginTitle.textContent = content.title;
  loginSubheading.textContent = content.subheading;
  googleLabel.textContent = content.google;
  secondSocialLabel.textContent = content.second;
  secondSocialIcon.textContent = content.secondIcon;
  signinButtonText.textContent = content.button;
  form.elements.email.placeholder = type === 'employer' ? 'you@company.com' : 'you@example.com';
  message.textContent = '';
};

accountButtons.forEach((button) => button.addEventListener('click', () => setAccountType(button.dataset.accountType)));

reveal.addEventListener('click', () => {
  const hidden = password.type === 'password';
  password.type = hidden ? 'text' : 'password';
  reveal.textContent = hidden ? 'Hide' : 'Show';
  reveal.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const button = form.querySelector('.continue');
  button.disabled = true;
  signinButtonText.textContent = 'Signing you in…';

  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value, accountType: selectedAccountType }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sign in failed.');
    sessionStorage.setItem('careerlyAccessToken', data.accessToken);
    signinButtonText.textContent = selectedAccountType === 'employer' ? 'Hiring workspace ready ✓' : 'Welcome back!';
    button.style.background = '#3d315b';
    const returnTo = loginParameters.get('returnTo');
    const candidateDestination = returnTo && returnTo.startsWith('homepage.html') ? returnTo : 'homepage.html';
    window.setTimeout(() => { window.location.href = selectedAccountType === 'employer' ? 'employer-dashboard.html' : candidateDestination; }, 700);
  } catch (error) {
    message.textContent = error.message === 'Failed to fetch'
      ? 'The Careerly server is unavailable. Run npm.cmd start, then open http://localhost:3000/login.html.'
      : error.message;
    button.disabled = false;
    signinButtonText.textContent = accountContent[selectedAccountType].button;
  }
});

const loginParameters = new URLSearchParams(window.location.search);
if (loginParameters.get('account') === 'employer') setAccountType('employer');
if (loginParameters.get('registered') === '1') {
  message.style.color = '#4f8d77';
  message.textContent = 'Registration successful. Sign in with your new credentials.';
}
