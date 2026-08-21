const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.querySelector('.nav-menu');

window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 8));

menuToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  menuToggle.classList.toggle('active', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

document.querySelectorAll('.dropdown-toggle').forEach((toggle) => {
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
    const decimals = target % 1 === 0 ? 0 : 1;

    const tick = (now) => {
      const progress = Math.min((now - start) / 1050, 1);
      const value = target * (1 - Math.pow(1 - progress, 3));
      counter.textContent = value.toFixed(decimals);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    observer.unobserve(counter);
  });
}, { threshold: 0.55 });

document.querySelectorAll('[data-count]').forEach((counter) => counterObserver.observe(counter));
document.querySelector('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
