/* =============================================
   HERO CANVAS — Trajectory / SLAM Animation
   ============================================= */
(function initCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, animId;
    const CYAN  = '#00d4ff';
    const BLUE  = '#3b82f6';
    const GREEN = '#10b981';

    // Grid dots
    const GRID_SPACING = 52;
    let dots = [];

    // Trajectory agents
    const agents = [];
    const NUM_AGENTS = 5;

    // Scan rings
    const scans = [];

    function resize() {
        W = canvas.width  = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
        buildGrid();
    }

    function buildGrid() {
        dots = [];
        for (let x = GRID_SPACING; x < W; x += GRID_SPACING) {
            for (let y = GRID_SPACING; y < H; y += GRID_SPACING) {
                dots.push({ x, y, base: 0.12, phase: Math.random() * Math.PI * 2 });
            }
        }
    }

    // Each agent follows a random smooth path
    function createAgent() {
        return {
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            trail: [],
            maxTrail: 80 + Math.floor(Math.random() * 80),
            color: [CYAN, BLUE, CYAN, GREEN, CYAN][Math.floor(Math.random() * 5)],
            scanTimer: 0,
            scanInterval: 160 + Math.floor(Math.random() * 200),
        };
    }

    for (let i = 0; i < NUM_AGENTS; i++) agents.push(createAgent());

    function stepAgent(a, t) {
        // Gentle wander
        a.vx += (Math.random() - 0.5) * 0.06;
        a.vy += (Math.random() - 0.5) * 0.06;

        // Speed clamp
        const speed = Math.hypot(a.vx, a.vy);
        const maxSpeed = 0.9;
        if (speed > maxSpeed) {
            a.vx = (a.vx / speed) * maxSpeed;
            a.vy = (a.vy / speed) * maxSpeed;
        }

        // Wrap edges
        if (a.x < 0) a.x += W;
        if (a.x > W) a.x -= W;
        if (a.y < 0) a.y += H;
        if (a.y > H) a.y -= H;

        a.x += a.vx;
        a.y += a.vy;
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > a.maxTrail) a.trail.shift();

        // Periodic scan pulse
        a.scanTimer++;
        if (a.scanTimer >= a.scanInterval) {
            a.scanTimer = 0;
            scans.push({ x: a.x, y: a.y, r: 0, maxR: 80 + Math.random() * 60, color: a.color, alpha: 0.7 });
        }
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);

        // --- Grid dots ---
        dots.forEach(d => {
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.001 + d.phase);
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1.2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(30, 58, 95, ${d.base + pulse * 0.12})`;
            ctx.fill();
        });

        // --- Grid lines (very faint) ---
        ctx.strokeStyle = 'rgba(26,45,74,0.35)';
        ctx.lineWidth = 0.5;
        for (let x = GRID_SPACING; x < W; x += GRID_SPACING) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = GRID_SPACING; y < H; y += GRID_SPACING) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // --- Agents + trails ---
        agents.forEach(a => {
            stepAgent(a, t);
            const trail = a.trail;
            if (trail.length < 2) return;

            for (let i = 1; i < trail.length; i++) {
                const prog = i / trail.length;
                const alpha = prog * 0.5;
                const width = prog * 1.5;
                ctx.beginPath();
                ctx.moveTo(trail[i-1].x, trail[i-1].y);
                ctx.lineTo(trail[i].x, trail[i].y);
                ctx.strokeStyle = hexToRgba(a.color, alpha);
                ctx.lineWidth = width;
                ctx.stroke();
            }

            // Agent head dot
            ctx.beginPath();
            ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = a.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = a.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // --- Scan rings ---
        for (let i = scans.length - 1; i >= 0; i--) {
            const s = scans[i];
            s.r += 1.4;
            s.alpha *= 0.975;
            if (s.alpha < 0.01 || s.r > s.maxR) {
                scans.splice(i, 1);
                continue;
            }
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.strokeStyle = hexToRgba(s.color, s.alpha * 0.4);
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        animId = requestAnimationFrame(draw);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    window.addEventListener('resize', () => { cancelAnimationFrame(animId); resize(); animId = requestAnimationFrame(draw); });
    resize();
    animId = requestAnimationFrame(draw);
})();

/* =============================================
   NAV — scroll behavior + mobile toggle
   ============================================= */
(function initNav() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    toggle?.addEventListener('click', () => {
        links?.classList.toggle('open');
    });

    // Close mobile nav on link click
    links?.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => links.classList.remove('open'));
    });

    // Active nav link on scroll
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(l => l.classList.remove('active'));
                const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
                active?.classList.add('active');
            }
        });
    }, { threshold: 0.4 });

    sections.forEach(s => observer.observe(s));
})();

/* =============================================
   SCROLL REVEAL
   ============================================= */
(function initReveal() {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => obs.observe(el));
})();

/* =============================================
   PROJECT FILTER
   ============================================= */
(function initFilter() {
    const btns = document.querySelectorAll('.filter-btn');
    const cards = document.querySelectorAll('.project-card');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;

            cards.forEach(card => {
                if (filter === 'all') {
                    card.classList.remove('hidden');
                } else {
                    const tags = card.dataset.tags || '';
                    card.classList.toggle('hidden', !tags.includes(filter));
                }
            });
        });
    });
})();

/* =============================================
   SMOOTH ANCHOR SCROLL
   ============================================= */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
        const href = anchor.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        const offset = 64;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});
