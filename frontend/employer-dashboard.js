const token = sessionStorage.getItem('careerlyAccessToken');
const isLocal = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBase = isLocal && window.location.port !== '3000' ? 'http://localhost:3000' : '';
const dialog = document.querySelector('#post-dialog');
const postForm = document.querySelector('#post-job-form');
const candidateDialog = document.querySelector('#candidate-dialog');
const companyProfileForm = document.querySelector('#company-profile-form');
let selectedApplication = null;
let dashboard = null;
if (!token) window.location.replace('employer-login.html');

const request = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
};
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusSelect = (current, choices, onChange) => {
  const select = document.createElement('select');
  choices.forEach((choice) => { const option = document.createElement('option'); option.value = choice; option.textContent = label(choice); option.selected = choice === current; select.append(option); });
  select.addEventListener('change', () => onChange(select.value)); return select;
};
const fillTokens = (selector, values, emptyText) => { const container = document.querySelector(selector); container.innerHTML = ''; if (!(values || []).length) { container.textContent = emptyText; return; } values.forEach((value) => { const token = document.createElement('span'); token.textContent = value; container.append(token); }); };
const fillHistory = (selector, values, type) => { const container = document.querySelector(selector); container.innerHTML = ''; if (!(values || []).length) { container.textContent = type === 'experience' ? 'No work experience added.' : 'No education added.'; return; } values.forEach((value) => { const item = document.createElement('article'); const title = document.createElement('b'); const detail = document.createElement('small'); title.textContent = type === 'experience' ? value.title || 'Role' : value.degree || 'Qualification'; detail.textContent = type === 'experience' ? [value.company, value.location].filter(Boolean).join(' · ') : [value.institution, value.field].filter(Boolean).join(' · '); item.append(title, detail); container.append(item); }); };
const openCandidate = (application) => {
  selectedApplication = application; const candidate = application.candidate || {}; const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate';
  document.querySelector('#candidate-avatar').textContent = `${candidate.firstName?.charAt(0) || ''}${candidate.lastName?.charAt(0) || ''}`.toUpperCase() || 'C'; document.querySelector('#candidate-name').textContent = fullName; document.querySelector('#candidate-headline').textContent = candidate.headline || candidate.currentJobTitle || 'Careerly candidate'; document.querySelector('#candidate-summary').textContent = candidate.professionalSummary || 'No professional summary added.';
  const contact = document.querySelector('#candidate-contact'); contact.innerHTML = ''; [candidate.email, candidate.phone, [candidate.city, candidate.state, candidate.country].filter(Boolean).join(', '), candidate.experienceYears ? `${candidate.experienceYears} years experience` : ''].filter(Boolean).forEach((value) => { const item = document.createElement('span'); item.textContent = value; contact.append(item); });
  fillTokens('#candidate-skills', candidate.skills, 'No skills added.'); fillHistory('#candidate-experience', candidate.experience, 'experience'); fillHistory('#candidate-education', candidate.education, 'education'); document.querySelector('#download-resume').disabled = !candidate.resumeAvailable; document.querySelector('#candidate-message').textContent = candidate.resumeAvailable ? '' : 'This candidate has not uploaded a resume.'; candidateDialog.showModal();
};
const setProfileField = (name, value) => {
  const field = companyProfileForm.elements[name];
  if (!field || field.type === 'file') return;
  const normalized = value ?? '';
  if (field.tagName === 'SELECT' && normalized && ![...field.options].some((option) => option.value === String(normalized))) {
    const option = document.createElement('option'); option.value = normalized; option.textContent = normalized; field.append(option);
  }
  field.value = normalized;
};
const showCompanyLogo = (source = '') => {
  ['#header-company-logo', '#company-logo-image'].forEach((selector) => {
    const image = document.querySelector(selector); image.hidden = !source; if (source) image.src = source;
  });
  document.querySelector('#header-company-initial').hidden = Boolean(source);
  document.querySelector('#company-logo-initial').hidden = Boolean(source);
};
const fillCompanyProfile = (company, employer) => {
  const values = {
    firstName: employer.firstName, lastName: employer.lastName, workEmail: employer.workEmail,
    phoneCountryCode: employer.phoneCountryCode || '+91', phone: employer.phone, designation: employer.designation,
    legalName: company.legalName, brandName: company.brandName, website: company.website,
    companyType: company.companyType, industry: company.industry, companySize: company.companySize,
    founded: company.foundedYear, companyAbout: company.description, address: company.address,
    city: company.city, state: company.state, postalCode: company.postalCode, cin: company.cin, gstin: company.gstin,
  };
  Object.entries(values).forEach(([name, value]) => setProfileField(name, value));
  const companyName = company.brandName || company.legalName || 'Company';
  const initial = companyName.charAt(0).toUpperCase();
  document.querySelector('#header-company-name').textContent = companyName;
  document.querySelector('#header-company-initial').textContent = initial;
  document.querySelector('#company-logo-initial').textContent = initial;
  showCompanyLogo(company.logoPath ? `${apiBase}/api/companies/${company.id}/logo?v=${encodeURIComponent(company.updatedAt || company.createdAt || '')}` : '');
};
const render = () => {
  const { company, employer, metrics, jobs, applications } = dashboard;
  document.querySelector('#welcome').textContent = `Welcome back, ${employer.firstName}`;
  document.querySelector('#company-line').textContent = `${company.brandName || company.legalName} · ${employer.designation}`;
  document.querySelector('#company-name').textContent = company.brandName || company.legalName;
  document.querySelector('#company-status').textContent = `Verification status: ${label(company.verificationStatus)}`;
  const verificationBadge = document.querySelector('#verification-badge'); verificationBadge.textContent = label(company.verificationStatus); verificationBadge.classList.toggle('verified', company.verificationStatus === 'verified');
  fillCompanyProfile(company, employer);
  document.querySelector('#active-jobs').textContent = metrics.activeJobs;
  document.querySelector('#application-count').textContent = metrics.applications;
  document.querySelector('#shortlisted-count').textContent = metrics.shortlisted;
  const verified = true;
  const notice = document.querySelector('#verification-notice');
  notice.hidden = true;
  document.querySelector('#open-post').disabled = false;
  const jobsContainer = document.querySelector('#job-list'); jobsContainer.innerHTML = '';
  if (!jobs.length) jobsContainer.innerHTML = '<p class="empty">No vacancies yet. Verified companies can publish their first role here.</p>';
  jobs.forEach((job) => { const row = document.createElement('article'); row.className = 'job-row'; const mark = document.createElement('span'); mark.className = 'job-mark'; mark.textContent = job.title.charAt(0); const copy = document.createElement('div'); copy.innerHTML = `<h3></h3><p></p>`; copy.querySelector('h3').textContent = job.title; copy.querySelector('p').textContent = [label(job.employmentType), label(job.workModel), job.city, ...(job.skills || []).slice(0, 3)].filter(Boolean).join(' · '); const badge = document.createElement('span'); badge.className = `status ${job.status}`; badge.textContent = label(job.status); row.append(mark, copy, badge); if (verified) row.append(statusSelect(job.status, ['published','paused','closed'], async (status) => { await request(`/api/employer/jobs/${job.id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) }); await load(); })); jobsContainer.append(row); });
  const applicationsContainer = document.querySelector('#application-list'); applicationsContainer.innerHTML = '';
  if (!applications.length) applicationsContainer.innerHTML = '<p class="empty">Applications for your vacancies will appear here.</p>';
  applications.forEach((application) => { const row = document.createElement('article'); row.className = 'application-row'; const copy = document.createElement('div'); const candidate = application.candidate ? `${application.candidate.firstName} ${application.candidate.lastName}` : 'Candidate'; copy.innerHTML = `<h3></h3><p></p>`; copy.querySelector('h3').textContent = candidate; copy.querySelector('p').textContent = `${application.job?.title || 'Role'}${application.candidate?.headline ? ` · ${application.candidate.headline}` : ''}`; row.append(copy, statusSelect(application.status, ['viewed','shortlisted','interview','offered','hired','rejected'], async (status) => { await request(`/api/employer/applications/${application.id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) }); await load(); })); applicationsContainer.append(row); });
  applicationsContainer.querySelectorAll('.application-row').forEach((row, index) => { const view = document.createElement('button'); view.type = 'button'; view.className = 'view-profile'; view.textContent = 'View profile'; view.addEventListener('click', () => openCandidate(applications[index])); const select = row.querySelector('select'); row.insertBefore(view, select); });
};
const load = async () => { try { dashboard = await request('/api/employer/dashboard'); render(); } catch (error) { document.querySelector('main').innerHTML = `<p class="notice">${error.message}</p>`; } };
document.querySelector('#open-post').addEventListener('click', () => dialog.showModal());
['#close-post','#cancel-post'].forEach((selector) => document.querySelector(selector).addEventListener('click', () => dialog.close()));
['#close-candidate','#cancel-candidate'].forEach((selector) => document.querySelector(selector).addEventListener('click', () => candidateDialog.close()));
document.querySelector('#download-resume').addEventListener('click', async () => {
  const message = document.querySelector('#candidate-message');
  try { const response = await fetch(`${apiBase}/api/employer/applications/${selectedApplication.id}/resume`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Resume download failed.'); } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `${selectedApplication.candidate.firstName}-${selectedApplication.candidate.lastName}-resume`; link.click(); URL.revokeObjectURL(url); }
  catch (error) { message.textContent = error.message; }
});
postForm.addEventListener('submit', async (event) => { event.preventDefault(); const button = postForm.querySelector('.primary'); button.disabled = true; const message = document.querySelector('#post-message'); try { await request('/api/employer/jobs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(postForm))) }); postForm.reset(); dialog.close(); await load(); } catch (error) { message.textContent = error.message; } finally { button.disabled = false; } });
document.querySelector('#show-all-jobs').addEventListener('click', () => document.querySelector('#vacancies').scrollIntoView({behavior:'smooth'}));
document.querySelector('#company-profile-button').addEventListener('click', () => document.querySelector('#company').scrollIntoView({ behavior: 'smooth', block: 'start' }));
companyProfileForm.elements.companyLogo.addEventListener('change', async () => {
  const file = companyProfileForm.elements.companyLogo.files[0];
  if (!file) return;
  const message = document.querySelector('#company-profile-message');
  showCompanyLogo(URL.createObjectURL(file));
  message.classList.remove('error'); message.textContent = 'Uploading company logo...';
  const logoData = new FormData(); logoData.append('companyLogo', file);
  try {
    await request('/api/employer/profile/logo', { method: 'PUT', body: logoData });
    message.textContent = 'Company logo updated successfully.';
    companyProfileForm.elements.companyLogo.value = '';
    await load();
  } catch (error) {
    message.classList.add('error'); message.textContent = error.message;
    fillCompanyProfile(dashboard.company, dashboard.employer);
  }
});
companyProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = companyProfileForm.querySelector('button[type="submit"]');
  const message = document.querySelector('#company-profile-message');
  button.disabled = true; message.classList.remove('error'); message.textContent = 'Saving company profile...';
  try {
    await request('/api/employer/profile', { method: 'PUT', body: new FormData(companyProfileForm) });
    message.textContent = 'Company profile updated successfully.';
    companyProfileForm.elements.companyLogo.value = '';
    await load();
  } catch (error) {
    message.classList.add('error'); message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#sign-out').addEventListener('click', () => { sessionStorage.removeItem('careerlyAccessToken'); window.location.href = 'login.html'; });
load();
