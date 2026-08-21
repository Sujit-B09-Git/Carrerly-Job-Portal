const accessToken = sessionStorage.getItem('careerlyAccessToken');
const localPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const apiBaseUrl = localPreview && window.location.port !== '3000' ? 'http://localhost:3000' : '';
const cards = document.querySelector('#application-cards');
const loadState = document.querySelector('#load-state');
const statusFilter = document.querySelector('#status-filter');
const totalCount = document.querySelector('#total-count');
const progressCount = document.querySelector('#progress-count');
const successCount = document.querySelector('#success-count');

const stageNames = ['Applied', 'Viewed', 'Shortlisted', 'Interview', 'Decision'];
const statusDetails = {
  submitted: { label: 'Submitted', percentage: 20, stage: 0 },
  viewed: { label: 'Viewed', percentage: 40, stage: 1 },
  shortlisted: { label: 'Shortlisted', percentage: 60, stage: 2 },
  interview: { label: 'Interview', percentage: 80, stage: 3 },
  offered: { label: 'Offered', percentage: 100, stage: 4 },
  hired: { label: 'Accepted', percentage: 100, stage: 4 },
  rejected: { label: 'Rejected', percentage: 100, stage: 4 },
  withdrawn: { label: 'Withdrawn', percentage: 100, stage: 4 },
};
let applications = [];

function readable(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderEmpty(message = 'You have not applied for any jobs yet.') {
  const empty = makeElement('div', 'empty');
  empty.append(makeElement('h3', '', 'No applications to show'), makeElement('p', '', message));
  const link = makeElement('a', '', 'Explore opportunities');
  link.href = 'homepage.html#featured';
  empty.append(link);
  cards.replaceChildren(empty);
}

function renderApplications() {
  const selectedStatus = statusFilter.value;
  const visible = selectedStatus === 'all' ? applications : applications.filter((item) => item.status === selectedStatus);
  cards.replaceChildren();
  loadState.hidden = true;
  if (!visible.length) {
    renderEmpty(selectedStatus === 'all' ? undefined : `You do not have any ${readable(selectedStatus).toLowerCase()} applications.`);
    return;
  }

  visible.forEach((application) => {
    const job = application.job || {};
    const company = job.company || {};
    const status = statusDetails[application.status] || statusDetails.submitted;
    const card = makeElement('article', `application-card ${application.status || 'submitted'}`);
    const top = makeElement('div', 'application-top');
    const logo = makeElement('div', 'company-logo', (company.brandName || company.legalName || 'C').charAt(0).toUpperCase());
    if (company.logoUrl) {
      logo.style.backgroundImage = `url("${apiBaseUrl}${company.logoUrl}")`;
      logo.textContent = '';
    }
    const identity = makeElement('div');
    identity.append(makeElement('h3', '', job.title || 'Job opportunity'));
    const location = [job.city, job.state, readable(job.workModel)].filter(Boolean).join(' | ');
    identity.append(makeElement('p', '', `${company.brandName || company.legalName || 'Company'}${location ? ` - ${location}` : ''}`));
    top.append(logo, identity, makeElement('span', `status ${application.status || 'submitted'}`, status.label));

    const progressHead = makeElement('div', 'progress-head');
    progressHead.append(makeElement('span', '', 'Application progress'), makeElement('strong', '', `${status.percentage}%`));
    const progressTrack = makeElement('div', 'progress-track');
    const progressBar = makeElement('i');
    progressBar.style.width = `${status.percentage}%`;
    progressTrack.append(progressBar);
    const stageLine = makeElement('div', 'stage-line');
    stageNames.forEach((stageName, index) => {
      const label = index === 4 && ['offered', 'hired', 'rejected', 'withdrawn'].includes(application.status) ? status.label : stageName;
      stageLine.append(makeElement('span', `stage${index <= status.stage ? ' complete' : ''}`, label));
    });
    const footer = makeElement('div', 'application-footer');
    footer.append(makeElement('span', '', `Applied on ${dateLabel(application.appliedAt)}`), makeElement('span', '', `Last updated ${dateLabel(application.updatedAt)}`));
    card.append(top, progressHead, progressTrack, stageLine, footer);
    cards.append(card);
  });
}

async function loadApplications() {
  const loginUrl = `login.html?account=job_seeker&returnTo=${encodeURIComponent('candidate-applications.html')}`;
  if (!accessToken) {
    window.location.replace(loginUrl);
    return;
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/job-seekers/me/applications`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem('careerlyAccessToken');
      window.location.replace(loginUrl);
      return;
    }
    if (!response.ok) throw new Error(payload.error || 'Could not load your applications.');
    applications = Array.isArray(payload.applications) ? payload.applications : [];
    totalCount.textContent = applications.length;
    progressCount.textContent = applications.filter((item) => ['submitted', 'viewed', 'shortlisted', 'interview'].includes(item.status)).length;
    successCount.textContent = applications.filter((item) => ['offered', 'hired'].includes(item.status)).length;
    renderApplications();
  } catch (error) {
    loadState.hidden = false;
    loadState.textContent = error.message || 'The Careerly server is unavailable. Please try again.';
  }
}

statusFilter.addEventListener('change', renderApplications);
document.querySelector('#sign-out').addEventListener('click', () => {
  sessionStorage.removeItem('careerlyAccessToken');
  window.location.href = 'login.html?account=job_seeker';
});
loadApplications();
