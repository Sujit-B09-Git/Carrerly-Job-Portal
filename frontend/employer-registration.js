const form = document.querySelector('#employer-form');
const steps = [...document.querySelectorAll('.form-step')];
const progressSteps = [...document.querySelectorAll('.progress-step')];
const nextButton = document.querySelector('#next-button');
const backButton = document.querySelector('#back-button');
const submitButton = document.querySelector('#submit-button');
const alertBox = document.querySelector('.form-alert');
const mobileLabel = document.querySelector('#mobile-step-label');
const mobileBar = document.querySelector('.mobile-progress i');
let currentStep = 1;
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = isLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';

const showStep = (step) => {
  currentStep = Math.max(1, Math.min(step, steps.length));
  steps.forEach((section) => section.classList.toggle('active', Number(section.dataset.step) === currentStep));
  progressSteps.forEach((item) => {
    const itemStep = Number(item.dataset.step);
    item.classList.toggle('active', itemStep === currentStep);
    item.classList.toggle('complete', itemStep < currentStep);
  });
  backButton.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
  nextButton.style.display = currentStep === steps.length ? 'none' : 'block';
  submitButton.style.display = currentStep === steps.length ? 'block' : 'none';
  mobileLabel.textContent = `Step ${currentStep} of ${steps.length}`;
  mobileBar.style.width = `${(currentStep / steps.length) * 100}%`;
  alertBox.classList.remove('show');
  alertBox.textContent = '';
  if (currentStep === steps.length) updateReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const validateStep = (step) => {
  const section = steps[step - 1];
  const requiredFields = [...section.querySelectorAll('[required]')];
  let valid = true;

  requiredFields.forEach((field) => {
    const fieldValid = field.checkValidity();
    field.classList.toggle('invalid', !fieldValid && field.type !== 'hidden' && field.type !== 'checkbox');
    if (!fieldValid) valid = false;
  });

  section.querySelectorAll('.choice-group[data-required="true"]').forEach((group) => {
    const selected = group.querySelector('.selected');
    group.classList.toggle('choice-invalid', !selected);
    if (!selected) valid = false;
  });

  if (!valid) {
    alertBox.textContent = 'Please complete all required fields before continuing.';
    alertBox.classList.add('show');
    const firstInvalid = section.querySelector('.invalid');
    if (firstInvalid) firstInvalid.focus();
  }
  return valid;
};

nextButton.addEventListener('click', () => {
  if (!validateStep(currentStep)) return;
  saveProgress();
  showStep(currentStep + 1);
});

backButton.addEventListener('click', () => showStep(currentStep - 1));
progressSteps.forEach((item) => item.addEventListener('click', () => {
  const target = Number(item.dataset.step);
  if (target < currentStep) showStep(target);
}));
document.querySelectorAll('[data-go-step]').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.goStep))));

document.querySelectorAll('.choice-chips button').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('selected');
    const group = button.closest('.choice-group');
    group.querySelector('input[type="hidden"]').value = [...group.querySelectorAll('.selected')].map((item) => item.dataset.value).join(', ');
    group.classList.remove('choice-invalid');
  });
});

document.querySelectorAll('.option-cards button').forEach((button) => {
  button.addEventListener('click', () => {
    const group = button.closest('.choice-group');
    group.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    group.querySelector('input[type="hidden"]').value = button.dataset.value;
    group.classList.remove('choice-invalid');
  });
});

const password = document.querySelector('#employer-password');
const showPassword = document.querySelector('#show-password');
const confirmPassword = document.querySelector('#employer-confirm-password');
const showConfirmPassword = document.querySelector('#show-confirm-password');
const passwordMatchMessage = document.querySelector('.password-match-message');
const strengthBars = [...document.querySelectorAll('.strength i')];
showPassword.addEventListener('click', () => {
  const hidden = password.type === 'password';
  password.type = hidden ? 'text' : 'password';
  showPassword.textContent = hidden ? 'Hide' : 'Show';
});
showConfirmPassword.addEventListener('click', () => {
  const hidden = confirmPassword.type === 'password';
  confirmPassword.type = hidden ? 'text' : 'password';
  showConfirmPassword.textContent = hidden ? 'Hide' : 'Show';
});

const validateEmployerPasswordMatch = () => {
  const matches = password.value === confirmPassword.value;
  confirmPassword.setCustomValidity(matches ? '' : 'Passwords do not match.');
  passwordMatchMessage.textContent = confirmPassword.value ? (matches ? '✓ Passwords match' : 'Passwords do not match') : '';
  passwordMatchMessage.classList.toggle('matched', matches && Boolean(confirmPassword.value));
  return matches;
};
password.addEventListener('input', validateEmployerPasswordMatch);
confirmPassword.addEventListener('input', validateEmployerPasswordMatch);
password.addEventListener('input', () => {
  const value = password.value;
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  strengthBars.forEach((bar, index) => { bar.style.background = index < score ? (score >= 3 ? '#4f8d77' : '#ed6b4b') : '#e5e2e7'; });
});

const aboutField = form.elements.companyAbout;
aboutField.addEventListener('input', () => { document.querySelector('.char-count span').textContent = aboutField.value.length; });

const uploadZone = document.querySelector('#upload-zone');
const fileInput = document.querySelector('#document-upload');
const fileName = uploadZone.querySelector('.file-selected b');
const fileSize = uploadZone.querySelector('.file-selected small');
const removeFile = uploadZone.querySelector('.file-selected button');
const displayFile = (file) => {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alertBox.textContent = 'The verification document must be smaller than 10 MB.';
    alertBox.classList.add('show');
    fileInput.value = '';
    return;
  }
  fileName.textContent = file.name;
  fileSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload`;
  uploadZone.classList.add('has-file');
};
fileInput.addEventListener('change', () => displayFile(fileInput.files[0]));
['dragenter', 'dragover'].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => { event.preventDefault(); uploadZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => { event.preventDefault(); uploadZone.classList.remove('dragging'); }));
uploadZone.addEventListener('drop', (event) => {
  if (!event.dataTransfer.files.length) return;
  fileInput.files = event.dataTransfer.files;
  displayFile(fileInput.files[0]);
});
removeFile.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  fileInput.value = '';
  uploadZone.classList.remove('has-file');
});

const updateReview = () => {
  const value = (name) => form.elements[name]?.value.trim() || '—';
  document.querySelector('#review-person').textContent = `${value('firstName')} ${value('lastName')}`.replace('— —', '—');
  document.querySelector('#review-company').textContent = value('legalName');
  document.querySelector('#review-email').textContent = value('workEmail');
};

const saveProgress = () => {
  const safeFields = ['firstName', 'lastName', 'designation', 'legalName', 'brandName', 'website', 'companyType', 'industry', 'companySize', 'founded', 'city', 'state'];
  const data = {};
  safeFields.forEach((name) => { if (form.elements[name]?.value) data[name] = form.elements[name].value; });
  localStorage.setItem('careerlyEmployerDraft', JSON.stringify(data));
};

const restoreProgress = () => {
  try {
    const data = JSON.parse(localStorage.getItem('careerlyEmployerDraft'));
    if (!data) return;
    Object.entries(data).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value; });
  } catch (_) {
    localStorage.removeItem('careerlyEmployerDraft');
  }
};

form.addEventListener('input', (event) => event.target.classList.remove('invalid'));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateEmployerPasswordMatch()) {
    showStep(1);
    alertBox.textContent = 'Both passwords must match before registration can be submitted.';
    alertBox.classList.add('show');
    confirmPassword.focus();
    return;
  }
  if (!validateStep(steps.length)) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting securely…';
  alertBox.classList.remove('show');

  try {
    const response = await fetch(`${apiBaseUrl}/api/employers/register`, { method: 'POST', body: new FormData(form) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Registration could not be submitted.');

    localStorage.removeItem('careerlyEmployerDraft');
    document.querySelector('#application-reference').textContent = data.applicationReference;
    document.querySelector('#success-modal').classList.add('open');
    window.setTimeout(() => { window.location.href = 'login.html?account=employer&registered=1'; }, 2200);
  } catch (error) {
    alertBox.textContent = error.message === 'Failed to fetch'
      ? 'The Careerly server is unavailable. Start the Node.js server and try again.'
      : error.message;
    alertBox.classList.add('show');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit for verification <span>→</span>';
  }
});

restoreProgress();
showStep(1);
