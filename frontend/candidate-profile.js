const form = document.querySelector('#candidate-profile-form');
const app = document.querySelector('#profile-app');
const loadingScreen = document.querySelector('#loading-screen');
const authWall = document.querySelector('#auth-wall');
const token = sessionStorage.getItem('careerlyAccessToken');
const isLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = isLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';

const state = {
  profile: null,
  skills: [],
  languages: [],
  savedCompletion: 0,
  dirty: false,
  toastTimer: null,
  photoPreviewUrl: null,
};

const sectionForItem = {
  basics: 'basics',
  headline: 'basics',
  about: 'about',
  location: 'about',
  experience: 'experience',
  education: 'education',
  skills: 'skills',
  resume: 'resume',
  preferences: 'preferences',
  more: 'more',
};

const clean = (value) => String(value || '').trim();
const listFromText = (value) => [...new Set(clean(value).split(',').map((item) => item.trim()).filter(Boolean))];
const initials = (firstName, lastName) => `${clean(firstName).charAt(0)}${clean(lastName).charAt(0)}`.toUpperCase() || 'C';
const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const apiRequest = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return { response, data };
};

const showAuthWall = () => {
  loadingScreen.hidden = true;
  app.hidden = true;
  authWall.hidden = false;
  document.body.classList.remove('is-loading');
};

const setDirty = (dirty = true) => {
  state.dirty = dirty;
  const saveState = document.querySelector('#save-state');
  const statusDot = document.querySelector('#form-status-dot');
  const status = document.querySelector('#form-status');
  saveState.classList.toggle('unsaved', dirty);
  saveState.textContent = dirty ? 'Unsaved changes' : 'All changes saved';
  statusDot.className = dirty ? 'unsaved' : 'saved';
  status.textContent = dirty ? 'You have unsaved profile changes.' : 'Your latest profile changes are saved.';
};

const showToast = (title, copy, error = false) => {
  const toast = document.querySelector('#profile-toast');
  toast.classList.toggle('error', error);
  document.querySelector('#toast-icon').textContent = error ? '!' : 'OK';
  document.querySelector('#toast-title').textContent = title;
  document.querySelector('#toast-copy').textContent = copy;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
};

const setField = (name, value) => {
  const field = form.elements[name];
  if (field && typeof field.value !== 'undefined') field.value = value || '';
};

const createExperience = (item = {}) => {
  const card = document.createElement('article');
  card.className = 'repeater-card';
  card.dataset.record = 'experience';
  card.innerHTML = `
    <h3 class="repeater-title">Experience entry</h3>
    <button class="remove-entry" type="button" aria-label="Remove experience">x</button>
    <div class="repeater-card-grid">
      <label><span>Job title *</span><input data-key="title" maxlength="180" placeholder="e.g. Frontend Developer" /></label>
      <label><span>Company *</span><input data-key="company" maxlength="180" placeholder="e.g. Acme Technologies" /></label>
      <label><span>Location</span><input data-key="location" maxlength="180" placeholder="Pune / Remote" /></label>
      <label><span>Start date</span><input data-key="startDate" type="month" /></label>
      <label><span>End date</span><input data-key="endDate" type="month" /></label>
      <label class="wide"><span>Description and achievements</span><textarea data-key="description" rows="4" maxlength="1200" placeholder="Describe your responsibilities, impact, and measurable achievements..."></textarea></label>
    </div>`;
  Object.entries(item).forEach(([key, value]) => {
    const input = card.querySelector(`[data-key="${key}"]`);
    if (input) input.value = value || '';
  });
  document.querySelector('#experience-list').append(card);
  refreshEmptyStates();
};

const createEducation = (item = {}) => {
  const card = document.createElement('article');
  card.className = 'repeater-card';
  card.dataset.record = 'education';
  card.innerHTML = `
    <h3 class="repeater-title">Education entry</h3>
    <button class="remove-entry" type="button" aria-label="Remove education">x</button>
    <div class="repeater-card-grid">
      <label><span>Degree / qualification *</span><input data-key="degree" maxlength="180" placeholder="e.g. Bachelor of Engineering" /></label>
      <label><span>Field of study</span><input data-key="field" maxlength="180" placeholder="e.g. Computer Science" /></label>
      <label class="wide"><span>School / university *</span><input data-key="institution" maxlength="220" placeholder="e.g. Savitribai Phule Pune University" /></label>
      <label><span>Start year</span><input data-key="startYear" inputmode="numeric" maxlength="4" placeholder="2020" /></label>
      <label><span>End year</span><input data-key="endYear" inputmode="numeric" maxlength="4" placeholder="2024" /></label>
      <label class="wide"><span>Grade / score</span><input data-key="grade" maxlength="80" placeholder="e.g. 8.6 CGPA or First Class" /></label>
    </div>`;
  Object.entries(item).forEach(([key, value]) => {
    const input = card.querySelector(`[data-key="${key}"]`);
    if (input) input.value = value || '';
  });
  document.querySelector('#education-list').append(card);
  refreshEmptyStates();
};

const createProject = (item = {}) => {
  const card = document.createElement('article');
  card.className = 'repeater-card';
  card.dataset.record = 'projects';
  card.innerHTML = `
    <h3 class="repeater-title">Project entry</h3>
    <button class="remove-entry" type="button" aria-label="Remove project">x</button>
    <div class="repeater-card-grid">
      <label><span>Project name *</span><input data-key="name" maxlength="180" placeholder="e.g. Careerly Job Portal" /></label>
      <label><span>Your role</span><input data-key="role" maxlength="180" placeholder="e.g. Full-stack Developer" /></label>
      <label class="wide"><span>Project link</span><input data-key="url" type="url" maxlength="500" placeholder="https://github.com/..." /></label>
      <label class="wide"><span>Description</span><textarea data-key="description" rows="3" maxlength="1000" placeholder="What did you build, which skills did you use, and what was the result?"></textarea></label>
    </div>`;
  Object.entries(item).forEach(([key, value]) => {
    const input = card.querySelector(`[data-key="${key}"]`);
    if (input) input.value = value || '';
  });
  document.querySelector('#project-list').append(card);
};

const createCertification = (item = {}) => {
  const card = document.createElement('article');
  card.className = 'repeater-card';
  card.dataset.record = 'certifications';
  card.innerHTML = `
    <h3 class="repeater-title">Certification entry</h3>
    <button class="remove-entry" type="button" aria-label="Remove certification">x</button>
    <div class="repeater-card-grid">
      <label><span>Certification name *</span><input data-key="name" maxlength="180" placeholder="e.g. AWS Cloud Practitioner" /></label>
      <label><span>Issuing organization</span><input data-key="issuer" maxlength="180" placeholder="e.g. Amazon Web Services" /></label>
      <label><span>Issue year</span><input data-key="year" inputmode="numeric" maxlength="4" placeholder="2026" /></label>
      <label><span>Credential link</span><input data-key="credentialUrl" type="url" maxlength="500" placeholder="https://..." /></label>
    </div>`;
  Object.entries(item).forEach(([key, value]) => {
    const input = card.querySelector(`[data-key="${key}"]`);
    if (input) input.value = value || '';
  });
  document.querySelector('#certification-list').append(card);
};

const collectRecords = (selector, keys) => [...document.querySelectorAll(`${selector} .repeater-card`)].map((card) => {
  const record = {};
  keys.forEach((key) => { record[key] = clean(card.querySelector(`[data-key="${key}"]`)?.value); });
  return record;
}).filter((record) => Object.values(record).some(Boolean));

const renderTokens = (kind) => {
  const values = state[kind];
  const container = document.querySelector(`#${kind === 'skills' ? 'skill' : 'language'}-list`);
  container.innerHTML = '';
  values.forEach((value) => {
    const chip = document.createElement('span');
    chip.className = 'token';
    chip.textContent = value;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'x';
    remove.setAttribute('aria-label', `Remove ${value}`);
    remove.addEventListener('click', () => {
      state[kind] = state[kind].filter((item) => item !== value);
      renderTokens(kind);
      profileChanged();
    });
    chip.append(remove);
    container.append(chip);
  });
};

const addToken = (kind, input) => {
  const value = clean(input.value);
  if (!value) return;
  if (!state[kind].some((item) => item.toLowerCase() === value.toLowerCase())) state[kind].push(value);
  input.value = '';
  renderTokens(kind);
  profileChanged();
};

const refreshEmptyStates = () => {
  document.querySelector('#experience-empty').hidden = Boolean(document.querySelector('#experience-list').children.length);
  document.querySelector('#education-empty').hidden = Boolean(document.querySelector('#education-list').children.length);
};

const readCurrentProfile = () => ({
  firstName: clean(form.elements.firstName.value),
  lastName: clean(form.elements.lastName.value),
  phone: clean(form.elements.phone.value),
  headline: clean(form.elements.headline.value),
  professionalSummary: clean(form.elements.professionalSummary.value),
  city: clean(form.elements.city.value),
  state: clean(form.elements.state.value),
  country: clean(form.elements.country.value),
  currentJobTitle: clean(form.elements.currentJobTitle.value),
  currentCompany: clean(form.elements.currentCompany.value),
  experienceYears: clean(form.elements.experienceYears.value),
  employmentStatus: clean(form.elements.employmentStatus.value),
  linkedinUrl: clean(form.elements.linkedinUrl.value),
  portfolioUrl: clean(form.elements.portfolioUrl.value),
  salaryExpectation: clean(form.elements.salaryExpectation.value),
  noticePeriod: clean(form.elements.noticePeriod.value),
  profileVisibility: form.elements.profileVisibility.value,
  preferredRoles: listFromText(document.querySelector('#preferred-roles').value),
  preferredLocations: listFromText(document.querySelector('#preferred-locations').value),
  workModes: [...form.querySelectorAll('[name="workModes"]:checked')].map((input) => input.value),
  skills: state.skills,
  languages: state.languages,
  experience: collectRecords('#experience-list', ['title', 'company', 'location', 'startDate', 'endDate', 'description']),
  education: collectRecords('#education-list', ['degree', 'field', 'institution', 'startYear', 'endYear', 'grade']),
  projects: collectRecords('#project-list', ['name', 'role', 'url', 'description']),
  certifications: collectRecords('#certification-list', ['name', 'issuer', 'year', 'credentialUrl']),
  resume: document.querySelector('#resume-input').files[0] || state.profile?.resume || null,
});

const calculateCompletion = (profile) => {
  const items = [
    { id: 'basics', label: 'Basic information', weight: 10, complete: Boolean(profile.firstName && profile.lastName && profile.phone) },
    { id: 'headline', label: 'Professional headline', weight: 10, complete: Boolean(profile.headline) },
    { id: 'about', label: 'About you', weight: 10, complete: profile.professionalSummary.length >= 50 },
    { id: 'location', label: 'Location', weight: 10, complete: Boolean(profile.city && profile.country) },
    { id: 'experience', label: 'Work experience', weight: 15, complete: profile.experience.some((item) => item.title && item.company) },
    { id: 'education', label: 'Education', weight: 15, complete: profile.education.some((item) => item.degree && item.institution) },
    { id: 'skills', label: 'Skills', weight: 10, complete: profile.skills.length >= 5 },
    { id: 'resume', label: 'Resume', weight: 10, complete: Boolean(profile.resume) },
    { id: 'preferences', label: 'Job preferences', weight: 5, complete: Boolean(profile.preferredRoles.length && profile.preferredLocations.length && profile.workModes.length) },
    { id: 'more', label: 'Projects and more', weight: 5, complete: Boolean(profile.projects.length || profile.certifications.length || profile.languages.length) },
  ];
  return { percentage: items.reduce((total, item) => total + (item.complete ? item.weight : 0), 0), items };
};

const renderCompletion = (completion) => {
  document.querySelector('#completion-ring').style.setProperty('--progress', `${completion.percentage * 3.6}deg`);
  document.querySelector('#completion-value').textContent = `${completion.percentage}%`;
  const title = document.querySelector('#completion-title');
  const copy = document.querySelector('#completion-copy');
  if (completion.percentage === 100) {
    title.textContent = 'Profile complete';
    copy.textContent = 'You are ready to stand out to employers.';
  } else if (completion.percentage >= 70) {
    title.textContent = 'Looking strong';
    copy.textContent = 'A few more details will complete your story.';
  } else if (completion.percentage >= 35) {
    title.textContent = 'Good progress';
    copy.textContent = 'Keep going to improve recruiter visibility.';
  } else {
    title.textContent = 'Let us get started';
    copy.textContent = 'Complete your details to stand out to recruiters.';
  }

  const list = document.querySelector('#completion-list');
  list.innerHTML = '';
  completion.items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `completion-item${item.complete ? ' complete' : ''}`;
    button.innerHTML = `<i>${item.complete ? '&#10003;' : ''}</i><span></span><b>+${item.weight}%</b>`;
    button.querySelector('span').textContent = item.label;
    button.addEventListener('click', () => document.querySelector(`#${sectionForItem[item.id]}`).scrollIntoView({ behavior: 'smooth' }));
    list.append(button);
  });
};

const updatePreview = () => {
  const profile = readCurrentProfile();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Your name';
  const profileInitials = initials(profile.firstName, profile.lastName);
  document.querySelector('#profile-name').textContent = fullName;
  document.querySelector('#profile-headline').textContent = profile.headline || 'Add a professional headline to introduce yourself.';
  document.querySelector('#profile-location').textContent = [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || 'Add your location';
  document.querySelector('#profile-status').textContent = profile.employmentStatus || 'Open to opportunities';
  document.querySelector('#hero-initials').textContent = profileInitials;
  document.querySelector('#nav-initials').textContent = profileInitials;
  const visibilityLabels = { public: 'Public profile', employers_only: 'Employers only', private: 'Private profile' };
  document.querySelector('#visibility-pill').textContent = visibilityLabels[profile.profileVisibility] || 'Employers only';
  document.querySelector('#summary-count').textContent = profile.professionalSummary.length;
  renderCompletion(calculateCompletion(profile));
};

const renderProfilePhoto = (url = '') => {
  ['#hero-photo', '#nav-photo'].forEach((selector) => {
    const image = document.querySelector(selector);
    image.hidden = !url;
    if (url) image.src = url;
  });
  document.querySelector('#hero-initials').hidden = Boolean(url);
  document.querySelector('#nav-initials').hidden = Boolean(url);
  document.querySelector('#profile-photo-status').textContent = url ? 'Profile photo saved' : 'No profile photo saved';
};

const loadSavedProfilePhoto = async (profile) => {
  if (!profile?.profilePhoto) return renderProfilePhoto();
  try {
    const { response } = await apiRequest('/api/job-seekers/me/photo');
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = URL.createObjectURL(await response.blob());
    renderProfilePhoto(state.photoPreviewUrl);
  } catch (_error) {
    renderProfilePhoto();
  }
};

const profileChanged = () => {
  setDirty(true);
  updatePreview();
};

const populateProfile = (profile, completion) => {
  state.profile = profile;
  state.skills = Array.isArray(profile.skills) ? [...profile.skills] : [];
  state.languages = Array.isArray(profile.languages) ? [...profile.languages] : [];
  state.savedCompletion = completion?.percentage || 0;
  [
    'firstName', 'lastName', 'phone', 'headline', 'professionalSummary', 'city', 'state', 'country',
    'currentJobTitle', 'currentCompany', 'experienceYears', 'employmentStatus', 'linkedinUrl',
    'portfolioUrl', 'salaryExpectation', 'noticePeriod', 'email',
  ].forEach((field) => setField(field, profile[field]));
  setField('country', profile.country || 'India');
  const visibility = form.querySelector(`[name="profileVisibility"][value="${profile.profileVisibility || 'employers_only'}"]`);
  if (visibility) visibility.checked = true;
  document.querySelector('#preferred-roles').value = (profile.preferredRoles || []).join(', ');
  document.querySelector('#preferred-locations').value = (profile.preferredLocations || []).join(', ');
  form.querySelectorAll('[name="workModes"]').forEach((input) => { input.checked = (profile.workModes || []).includes(input.value); });

  document.querySelector('#experience-list').innerHTML = '';
  (profile.experience || []).forEach(createExperience);
  document.querySelector('#education-list').innerHTML = '';
  (profile.education || []).forEach(createEducation);
  document.querySelector('#project-list').innerHTML = '';
  (profile.projects || []).forEach(createProject);
  document.querySelector('#certification-list').innerHTML = '';
  (profile.certifications || []).forEach(createCertification);
  renderTokens('skills');
  renderTokens('languages');
  refreshEmptyStates();
  renderResume(profile.resume);
  updatePreview();
  loadSavedProfilePhoto(profile);
  setDirty(false);
};

const renderResume = (resume) => {
  const drop = document.querySelector('#resume-drop');
  const filePanel = document.querySelector('#resume-file');
  if (!resume) {
    drop.hidden = false;
    filePanel.hidden = true;
    return;
  }
  const isFile = resume instanceof File;
  document.querySelector('#resume-name').textContent = isFile ? resume.name : resume.originalFileName;
  document.querySelector('#resume-meta').textContent = `${formatBytes(isFile ? resume.size : resume.size)}${isFile ? ' - ready to upload' : ' - saved to your profile'}`;
  drop.hidden = true;
  filePanel.hidden = false;
  document.querySelector('#download-resume').hidden = isFile;
};

const addJsonField = (formData, name, value) => formData.append(name, JSON.stringify(value));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    showToast('Check required fields', 'Add your first and last name before saving.', true);
    return;
  }
  const profile = readCurrentProfile();
  const payload = new FormData();
  [
    'firstName', 'lastName', 'phone', 'headline', 'professionalSummary', 'city', 'state', 'country',
    'currentJobTitle', 'currentCompany', 'experienceYears', 'employmentStatus', 'linkedinUrl',
    'portfolioUrl', 'salaryExpectation', 'noticePeriod', 'profileVisibility',
  ].forEach((field) => payload.append(field, profile[field] || ''));
  addJsonField(payload, 'preferredRoles', profile.preferredRoles);
  addJsonField(payload, 'preferredLocations', profile.preferredLocations);
  addJsonField(payload, 'workModes', profile.workModes);
  addJsonField(payload, 'skills', profile.skills);
  addJsonField(payload, 'languages', profile.languages);
  addJsonField(payload, 'experience', profile.experience);
  addJsonField(payload, 'education', profile.education);
  addJsonField(payload, 'projects', profile.projects);
  addJsonField(payload, 'certifications', profile.certifications);
  const resumeFile = document.querySelector('#resume-input').files[0];
  if (resumeFile) payload.append('resume', resumeFile);
  const profilePhotoFile = document.querySelector('#profile-photo-input').files[0];
  if (profilePhotoFile) payload.append('profilePhoto', profilePhotoFile);

  const button = document.querySelector('#save-profile');
  const buttonText = document.querySelector('#save-button-text');
  button.disabled = true;
  buttonText.textContent = 'Saving profile...';
  try {
    const { data } = await apiRequest('/api/job-seekers/me', { method: 'PUT', body: payload });
    const reachedOneHundred = state.savedCompletion < 100 && data.completion.percentage === 100;
    populateProfile(data.profile, data.completion);
    document.querySelector('#resume-input').value = '';
    document.querySelector('#profile-photo-input').value = '';
    showToast('Profile saved', `${data.completion.percentage}% complete - your information is up to date.`);
    if (reachedOneHundred) document.querySelector('#completion-celebration').hidden = false;
  } catch (error) {
    if (error.status === 401) return showAuthWall();
    showToast('Could not save profile', error.message, true);
  } finally {
    button.disabled = false;
    buttonText.textContent = 'Save profile';
  }
});

form.addEventListener('input', (event) => {
  if (event.target.id === 'skill-input' || event.target.id === 'language-input') return;
  profileChanged();
});

form.addEventListener('click', (event) => {
  const removeButton = event.target.closest('.remove-entry');
  if (removeButton) {
    removeButton.closest('.repeater-card').remove();
    refreshEmptyStates();
    profileChanged();
  }
});

document.querySelector('#add-experience').addEventListener('click', () => { createExperience(); profileChanged(); });
document.querySelector('[data-add="experience"]').addEventListener('click', () => { createExperience(); profileChanged(); });
document.querySelector('#add-education').addEventListener('click', () => { createEducation(); profileChanged(); });
document.querySelector('[data-add="education"]').addEventListener('click', () => { createEducation(); profileChanged(); });
document.querySelector('#add-project').addEventListener('click', () => { createProject(); profileChanged(); });
document.querySelector('#add-certification').addEventListener('click', () => { createCertification(); profileChanged(); });
document.querySelector('#add-skill').addEventListener('click', () => addToken('skills', document.querySelector('#skill-input')));
document.querySelector('#add-language').addEventListener('click', () => addToken('languages', document.querySelector('#language-input')));

['skill', 'language'].forEach((kind) => {
  document.querySelector(`#${kind}-input`).addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    addToken(kind === 'skill' ? 'skills' : 'languages', event.currentTarget);
  });
});

document.querySelectorAll('.suggested-row button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('#skill-input').value = button.textContent;
    addToken('skills', document.querySelector('#skill-input'));
  });
});

const resumeInput = document.querySelector('#resume-input');
const handleResumeFile = () => {
  const file = resumeInput.files[0];
  if (!file) return;
  const allowedExtensions = ['pdf', 'doc', 'docx'];
  const extension = file.name.split('.').pop().toLowerCase();
  if (!allowedExtensions.includes(extension) || file.size > 5 * 1024 * 1024) {
    resumeInput.value = '';
    showToast('Resume not accepted', 'Choose a PDF, DOC, or DOCX file smaller than 5 MB.', true);
    return;
  }
  renderResume(file);
  profileChanged();
};
resumeInput.addEventListener('change', handleResumeFile);
document.querySelector('#replace-resume').addEventListener('click', () => resumeInput.click());
const resumeDrop = document.querySelector('#resume-drop');
['dragenter', 'dragover'].forEach((type) => resumeDrop.addEventListener(type, (event) => { event.preventDefault(); resumeDrop.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((type) => resumeDrop.addEventListener(type, (event) => { event.preventDefault(); resumeDrop.classList.remove('dragover'); }));
resumeDrop.addEventListener('drop', (event) => {
  if (!event.dataTransfer.files.length) return;
  resumeInput.files = event.dataTransfer.files;
  handleResumeFile();
});

const profilePhotoInput = document.querySelector('#profile-photo-input');
profilePhotoInput.addEventListener('change', () => {
  const photo = profilePhotoInput.files[0];
  if (!photo) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(photo.type) || photo.size > 2 * 1024 * 1024) {
    profilePhotoInput.value = '';
    showToast('Photo not accepted', 'Choose a JPG, PNG, or WebP image smaller than 2 MB.', true);
    return;
  }
  if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
  state.photoPreviewUrl = URL.createObjectURL(photo);
  renderProfilePhoto(state.photoPreviewUrl);
  document.querySelector('#profile-photo-status').textContent = `${photo.name} ready to save`;
  profileChanged();
});
document.querySelector('#update-profile-photo').addEventListener('click', () => profilePhotoInput.click());

document.querySelector('#download-resume').addEventListener('click', async () => {
  try {
    const { response } = await apiRequest('/api/job-seekers/me/resume');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.profile?.resume?.originalFileName || 'resume';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast('Download failed', error.message, true);
  }
});

document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector(`#${button.dataset.scroll}`).scrollIntoView({ behavior: 'smooth' });
}));
document.querySelector('#sign-out').addEventListener('click', () => {
  sessionStorage.removeItem('careerlyAccessToken');
  window.location.href = 'login.html?account=job_seeker';
});
document.querySelector('#completion-celebration button').addEventListener('click', () => { document.querySelector('#completion-celebration').hidden = true; });

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  document.querySelectorAll('.section-nav a').forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
}, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .25, .5] });
document.querySelectorAll('.profile-section[id]').forEach((section) => sectionObserver.observe(section));

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('pagehide', () => { if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl); });

const loadProfile = async () => {
  if (!token) return showAuthWall();
  try {
    const { data } = await apiRequest('/api/job-seekers/me');
    populateProfile(data.profile, data.completion);
    loadingScreen.hidden = true;
    authWall.hidden = true;
    app.hidden = false;
    document.body.classList.remove('is-loading');
  } catch (error) {
    if (error.status === 401 || error.status === 403) return showAuthWall();
    loadingScreen.querySelector('p').textContent = error.message === 'Failed to fetch'
      ? 'The Careerly server is unavailable. Start it and refresh this page.'
      : error.message;
  }
};

loadProfile();
