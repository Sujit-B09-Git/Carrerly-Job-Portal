const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-menu');
const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
const roleInput = document.querySelector('#role-input');
const locationInput = document.querySelector('#location-input');
const searchForm = document.querySelector('#job-search');
const jobTabs = document.querySelectorAll('.job-tabs button');
const jobCards = document.querySelectorAll('.job-card');
const toast = document.querySelector('.toast');
const dynamicJobList = document.querySelector('#job-list');
const dynamicViewAll = document.querySelector('.view-all-mobile');
const homeIsLocalPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const homeApiBaseUrl = homeIsLocalPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';
const displayCompanyLogo = (element, company, name) => {
  const logoUrl = company?.logoUrl || (company?.logoPath ? `${homeApiBaseUrl}/api/companies/${company.id}/logo` : '');
  if (!logoUrl) return;
  element.textContent = '';
  element.style.backgroundImage = `url("${logoUrl}")`;
  element.style.backgroundSize = 'cover';
  element.style.backgroundPosition = 'center';
};
let employerJobs = [];
let registeredCompanies = [];
let homepageJobFilter = 'all';
let homepageShowsAllJobs = false;

window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 8));

menuToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  menuToggle.classList.toggle('active', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

dropdownToggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
    if (window.innerWidth <= 800) toggle.closest('.nav-group').classList.toggle('open');
  });
});

document.querySelectorAll('.nav-menu a').forEach((link) => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('open');
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

const counterObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const counter = entry.target;
    const target = Number(counter.dataset.count);
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / 1100, 1);
      counter.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    observer.unobserve(counter);
  });
}, { threshold: 0.6 });

document.querySelectorAll('[data-count]').forEach((counter) => counterObserver.observe(counter));

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const role = roleInput.value.trim();
  const location = locationInput.value.trim();
  document.querySelector('#featured .section-heading h2').textContent = role
    ? `${role} opportunities${location ? ` in ${location}` : ''}.`
    : 'Featured opportunities.';
  document.querySelector('#featured').scrollIntoView({ behavior: 'smooth' });
});

document.querySelectorAll('.popular-searches button').forEach((button) => {
  button.addEventListener('click', () => {
    const term = button.textContent.trim();
    if (term.toLowerCase() === 'remote') locationInput.value = 'Remote';
    else roleInput.value = term;
    searchForm.requestSubmit();
  });
});

document.querySelectorAll('.category-card[data-search]').forEach((card) => {
  card.addEventListener('click', (event) => {
    event.preventDefault();
    roleInput.value = card.dataset.search;
    homepageShowsAllJobs = true;
    searchForm.requestSubmit();
  });
});

jobTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    jobTabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    const filter = tab.dataset.filter;
    jobCards.forEach((card) => card.classList.toggle('hidden', filter !== 'all' && !card.dataset.tags.includes(filter)));
  });
});

let toastTimer;
document.querySelectorAll('.save-job').forEach((button) => {
  button.addEventListener('click', () => {
    const saved = button.classList.toggle('saved');
    button.textContent = saved ? '♥' : '♡';
    toast.querySelector('b').textContent = saved ? 'Job saved' : 'Job removed';
    toast.querySelector('small').textContent = saved ? 'Find it anytime in your saved jobs.' : 'This role was removed from saved jobs.';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  });
});

document.querySelector('#newsletter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  document.querySelector('.newsletter-status').textContent = 'You’re on the list — see you Tuesday!';
  event.currentTarget.reset();
});

document.querySelector('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const loadCandidateProfileSummary = async () => {
  const profilePercentage = document.querySelector('#home-profile-percentage');
  const profileProgress = document.querySelector('#home-profile-progress');
  const profileLink = document.querySelector('#home-profile-link');
  const profileAvatar = document.querySelector('.profile-avatar');
  const profileAction = document.querySelector('#candidate-profile-action');
  const signInLink = document.querySelector('#sign-in-link');
  const joinLink = document.querySelector('.join-button');
  const accessToken = sessionStorage.getItem('careerlyAccessToken');
  if (!accessToken) {
    profileLink.href = 'candidate-registration.html';
    profileLink.firstChild.textContent = 'Create your candidate profile ';
    return;
  }

  const localPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const profileApiBase = localPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';
  try {
    const response = await fetch(`${profileApiBase}/api/job-seekers/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const percentage = Number(data.completion?.percentage || 0);
    profilePercentage.textContent = `${percentage}%`;
    profileProgress.style.width = `${percentage}%`;
    profileLink.firstChild.textContent = percentage === 100 ? 'View your complete profile ' : 'Complete your profile ';
    const firstName = data.profile?.firstName || '';
    const lastName = data.profile?.lastName || '';
    profileAvatar.textContent = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'You';
    profileAction.hidden = false;
    signInLink.hidden = true;
    joinLink.hidden = true;
  } catch (_error) {
    profileLink.firstChild.textContent = 'Open your candidate profile ';
  }
};

loadCandidateProfileSummary();

const labelForJobValue = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const jobSalary = (job) => {
  if (!job.salaryMin && !job.salaryMax) return 'Competitive';
  const format = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
  return `${job.currency || 'INR'} ${job.salaryMin ? format(job.salaryMin) : ''}${job.salaryMin && job.salaryMax ? '–' : ''}${job.salaryMax ? format(job.salaryMax) : ''}`;
};
let selectedJobForApplication = null;
const signInToApply = (jobId) => {
  const returnTo = `homepage.html?applyJob=${encodeURIComponent(jobId)}#featured`;
  window.location.href = `login.html?account=job_seeker&returnTo=${encodeURIComponent(returnTo)}`;
};
const jobDetailsDialog = document.createElement('dialog');
jobDetailsDialog.className = 'job-details-dialog';
jobDetailsDialog.innerHTML = '<form method="dialog"><button class="job-dialog-close" value="cancel" aria-label="Close job details">×</button><p class="section-kicker">Job opportunity</p><h2></h2><p class="job-dialog-company"></p><div class="job-dialog-meta"></div><section><h3>About this role</h3><p class="job-dialog-description"></p></section><section><h3>Skills and requirements</h3><div class="job-dialog-skills"></div></section><label class="job-fit-confirmation"><input type="checkbox" /> <span>I have reviewed this job and meet its requirements.</span></label><p class="job-dialog-message" role="status"></p><div class="job-dialog-actions"><button value="cancel" type="button" class="job-dialog-cancel">Close</button><button type="button" class="job-dialog-apply" disabled>Apply for this job →</button></div></form>';
document.body.append(jobDetailsDialog);
const openJobDetails = (job) => {
  selectedJobForApplication = job;
  const companyName = job.company?.brandName || job.company?.legalName || 'Company';
  jobDetailsDialog.querySelector('h2').textContent = job.title;
  jobDetailsDialog.querySelector('.job-dialog-company').textContent = `${companyName} · ${[job.city, job.state].filter(Boolean).join(', ') || labelForJobValue(job.workModel)}`;
  jobDetailsDialog.querySelector('.job-dialog-meta').textContent = [labelForJobValue(job.employmentType), labelForJobValue(job.workModel), jobSalary(job)].filter(Boolean).join(' · ');
  jobDetailsDialog.querySelector('.job-dialog-description').textContent = job.description || 'No description has been provided for this role.';
  const skills = jobDetailsDialog.querySelector('.job-dialog-skills'); skills.innerHTML = '';
  (job.skills || []).forEach((skill) => { const tag = document.createElement('span'); tag.textContent = skill; skills.append(tag); });
  if (!skills.children.length) skills.textContent = 'Review the role description before applying.';
  jobDetailsDialog.querySelector('.job-fit-confirmation input').checked = false;
  jobDetailsDialog.querySelector('.job-dialog-apply').disabled = true;
  jobDetailsDialog.querySelector('.job-dialog-message').textContent = '';
  jobDetailsDialog.showModal();
};
jobDetailsDialog.querySelector('.job-dialog-cancel').addEventListener('click', () => jobDetailsDialog.close());
jobDetailsDialog.querySelector('.job-fit-confirmation input').addEventListener('change', (event) => { jobDetailsDialog.querySelector('.job-dialog-apply').disabled = !event.target.checked; });
jobDetailsDialog.querySelector('.job-dialog-apply').addEventListener('click', async () => {
  const message = jobDetailsDialog.querySelector('.job-dialog-message');
  const accessToken = sessionStorage.getItem('careerlyAccessToken');
  if (!accessToken) { signInToApply(selectedJobForApplication.id); return; }
  try {
    const response = await fetch(`${homeApiBaseUrl}/api/jobs/${selectedJobForApplication.id}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not apply.');
    message.textContent = 'Application submitted successfully.';
    jobDetailsDialog.querySelector('.job-dialog-apply').disabled = true;
  } catch (error) { message.textContent = error.message; }
});
const companyDetailsDialog = document.createElement('dialog');
companyDetailsDialog.className = 'company-details-dialog';
companyDetailsDialog.innerHTML = '<form method="dialog"><button class="company-dialog-close" value="cancel" aria-label="Close company details">×</button><div class="company-dialog-hero"><span class="company-dialog-avatar"></span><div><p class="section-kicker">Company profile</p><h2></h2><p class="company-dialog-meta"></p></div></div><section><h3>About the company</h3><p class="company-dialog-description"></p></section><div class="company-dialog-facts"></div><section><h3>Open jobs <span class="company-dialog-job-count"></span></h3><div class="company-dialog-jobs"></div></section></form>';
document.body.append(companyDetailsDialog);
const openCompanyDetails = (company) => {
  const name = company.brandName || company.legalName || 'Company';
  companyDetailsDialog.querySelector('.company-dialog-avatar').textContent = name.charAt(0).toUpperCase();
  displayCompanyLogo(companyDetailsDialog.querySelector('.company-dialog-avatar'), company, name);
  companyDetailsDialog.querySelector('h2').textContent = name;
  companyDetailsDialog.querySelector('.company-dialog-meta').textContent = [company.industry, company.companySize, company.city && company.state ? `${company.city}, ${company.state}` : company.city || company.state].filter(Boolean).join(' · ');
  companyDetailsDialog.querySelector('.company-dialog-description').textContent = company.description || 'No company description has been added yet.';
  const facts = companyDetailsDialog.querySelector('.company-dialog-facts'); facts.innerHTML = '';
  [['Industry', company.industry], ['Company size', company.companySize], ['Company type', company.companyType], ['Website', company.website]].filter(([, value]) => value).forEach(([label, value]) => { const fact = document.createElement('div'); const key = document.createElement('small'); key.textContent = label; const detail = document.createElement('b'); detail.textContent = value; fact.append(key, detail); facts.append(fact); });
  const companyJobs = employerJobs.filter((job) => String(job.companyId || job.company?.id) === String(company.id));
  companyDetailsDialog.querySelector('.company-dialog-job-count').textContent = `(${companyJobs.length})`;
  const list = companyDetailsDialog.querySelector('.company-dialog-jobs'); list.innerHTML = '';
  if (!companyJobs.length) list.innerHTML = '<p class="company-dialog-empty">No open jobs at this company right now.</p>';
  companyJobs.forEach((job) => { const item = document.createElement('button'); item.type = 'button'; item.className = 'company-dialog-job'; const title = document.createElement('b'); title.textContent = job.title; const meta = document.createElement('span'); meta.textContent = [labelForJobValue(job.employmentType), labelForJobValue(job.workModel), job.city].filter(Boolean).join(' · '); item.append(title, meta); item.addEventListener('click', () => { companyDetailsDialog.close(); openJobDetails(job); }); list.append(item); });
  companyDetailsDialog.showModal();
};
const renderEmployerJobs = () => {
  const role = roleInput.value.trim().toLowerCase();
  const location = locationInput.value.trim().toLowerCase();
  const normalizedFilter = homepageJobFilter === 'fulltime' ? 'full_time' : homepageJobFilter;
  const matches = employerJobs.filter((job) => {
    const searchable = [job.title, job.department, job.description, ...(job.skills || []), job.company?.legalName, job.company?.brandName].join(' ').toLowerCase();
    const locations = [job.city, job.state, job.country, job.workModel].join(' ').toLowerCase();
    return (!role || searchable.includes(role)) && (!location || locations.includes(location))
      && (normalizedFilter === 'all' || job.workModel === normalizedFilter || job.employmentType === normalizedFilter);
  });
  const visibleJobs = homepageShowsAllJobs ? matches : matches.slice(0, 4);
  dynamicJobList.innerHTML = '';
  if (!visibleJobs.length) dynamicJobList.innerHTML = '<p class="jobs-empty">No employer-posted jobs match your filters yet. Try another search or check back soon.</p>';
  visibleJobs.forEach((job) => {
    const card = document.createElement('article');
    card.className = 'job-card';
    const companyName = job.company?.brandName || job.company?.legalName || 'Company';
    const logo = document.createElement('div'); logo.className = 'company-logo linear'; logo.textContent = companyName.charAt(0).toUpperCase(); displayCompanyLogo(logo, job.company, companyName);
    const info = document.createElement('div'); info.className = 'job-info';
    const top = document.createElement('div'); top.className = 'job-topline'; top.innerHTML = '<span></span><i>New</i>'; top.querySelector('span').textContent = companyName;
    top.querySelector('span').className = 'job-company-link'; top.querySelector('span').tabIndex = 0; top.querySelector('span').addEventListener('click', () => openCompanyDetails(job.company));
    const title = document.createElement('h3'); title.textContent = job.title;
    const place = document.createElement('p'); place.textContent = [job.city, job.state, labelForJobValue(job.workModel)].filter(Boolean).join(' · ');
    const meta = document.createElement('div'); meta.className = 'job-meta';
    [labelForJobValue(job.employmentType), jobSalary(job), ...(job.skills || []).slice(0, 2)].forEach((value) => { const tag = document.createElement('span'); tag.textContent = value; meta.append(tag); });
    info.append(top, title, place, meta);
    const apply = document.createElement('button'); apply.className = 'save-job'; apply.type = 'button'; apply.textContent = 'Apply'; apply.setAttribute('aria-label', `Apply for ${job.title}`);
    apply.addEventListener('click', async () => { const accessToken = sessionStorage.getItem('careerlyAccessToken'); if (!accessToken) { signInToApply(job.id); return; } try { const response = await fetch(`${homeApiBaseUrl}/api/jobs/${job.id}/applications`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`}, body:JSON.stringify({}) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); apply.textContent = 'Applied'; apply.disabled = true; toast.querySelector('b').textContent = 'Application submitted'; toast.querySelector('small').textContent = 'The employer can now review your profile.'; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); } catch (error) { toast.querySelector('b').textContent = 'Could not apply'; toast.querySelector('small').textContent = error.message; toast.classList.add('show'); } });
    const view = document.createElement('button'); view.className = 'view-job'; view.type = 'button'; view.textContent = 'View job'; view.setAttribute('aria-label', `View details for ${job.title}`);
    view.addEventListener('click', () => openJobDetails(job));
    card.append(logo, info, view, apply); dynamicJobList.append(card);
  });
  dynamicViewAll.textContent = homepageShowsAllJobs || matches.length <= 4 ? `Showing ${matches.length} job${matches.length === 1 ? '' : 's'}` : `View all ${matches.length} jobs →`;
  dynamicJobList.append(dynamicViewAll);
};
const loadEmployerJobs = async () => {
  try {
    const response = await fetch(`${homeApiBaseUrl}/api/jobs`);
    if (!response.ok) throw new Error('Jobs unavailable');
    employerJobs = (await response.json()).jobs || [];
    renderEmployerJobs();
    const applyJobId = Number(new URLSearchParams(window.location.search).get('applyJob'));
    const applyJob = employerJobs.find((job) => job.id === applyJobId);
    if (applyJob) { document.querySelector('#featured').scrollIntoView(); openJobDetails(applyJob); }
  } catch (_error) {
    dynamicJobList.innerHTML = '<p class="jobs-empty">Jobs will appear here when employers publish them.</p>';
  }
};
const renderCompanies = () => {
  const cards = document.querySelector('#company-cards');
  cards.innerHTML = '';
  if (!registeredCompanies.length) {
    cards.innerHTML = '<p class="companies-empty">Companies will appear here as employers register.</p>';
    return;
  }
  registeredCompanies.forEach((company) => {
    const name = company.brandName || company.legalName || 'Company';
    const card = document.createElement('article'); card.className = 'company-card';
    const cover = document.createElement('div'); cover.className = 'company-cover live-company-cover';
    const coverName = document.createElement('strong'); coverName.textContent = name; cover.append(coverName);
    const body = document.createElement('div'); body.className = 'company-body';
    const title = document.createElement('div'); title.className = 'company-title';
    const logo = document.createElement('span'); logo.className = 'company-logo linear'; logo.textContent = name.charAt(0).toUpperCase(); displayCompanyLogo(logo, company, name);
    const details = document.createElement('div');
    const heading = document.createElement('h3'); heading.textContent = name;
    const meta = document.createElement('p'); meta.textContent = [company.industry, company.companySize].filter(Boolean).join(' · ') || 'Registered company';
    details.append(heading, meta);
    const jobs = document.createElement('b'); jobs.textContent = `${company.jobCount || 0} job${company.jobCount === 1 ? '' : 's'}`;
    title.append(logo, details, jobs);
    const description = document.createElement('p'); description.textContent = company.description || `${name} is hiring through Careerly.`;
    const values = document.createElement('div'); values.className = 'values';
    [company.city && company.state ? `${company.city}, ${company.state}` : company.city || company.state, company.verificationStatus === 'pending' ? 'Newly registered' : 'Verified company'].filter(Boolean).forEach((value) => {
      const tag = document.createElement('span'); tag.textContent = value; values.append(tag);
    });
    body.append(title, description, values); card.append(cover, body); card.tabIndex = 0; card.setAttribute('role', 'link'); card.setAttribute('aria-label', `View ${name}`);
    const openCompany = () => openCompanyDetails(company);
    card.addEventListener('click', openCompany); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openCompany(); } });
    cards.append(card);
  });
};
const loadRegisteredCompanies = async () => {
  try {
    const response = await fetch(`${homeApiBaseUrl}/api/companies`);
    if (!response.ok) throw new Error('Companies unavailable');
    registeredCompanies = (await response.json()).companies || [];
    renderCompanies();
  } catch (_error) {
    document.querySelector('#company-cards').innerHTML = '<p class="companies-empty">Companies will appear here as employers register.</p>';
  }
};
dynamicViewAll.addEventListener('click', (event) => { event.preventDefault(); homepageShowsAllJobs = true; renderEmployerJobs(); });
searchForm.addEventListener('submit', () => { homepageShowsAllJobs = true; renderEmployerJobs(); });
jobTabs.forEach((tab) => tab.addEventListener('click', () => { homepageJobFilter = tab.dataset.filter; homepageShowsAllJobs = true; renderEmployerJobs(); }));
loadEmployerJobs();
loadRegisteredCompanies();
