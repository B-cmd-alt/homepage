/**
 * BB.STYLE - EMERGENCE
 * The Story of Breaking Free & Shining
 */

(function() {
  'use strict';

  // ============================================
  // Emergence Controller
  // ============================================
  class EmergenceController {
    constructor() {
      this.emergence = document.getElementById('emergence');
      this.mainContent = document.getElementById('main-content');
      this.skipButton = document.getElementById('skip-emergence');
      this.progressBar = document.querySelector('.progress-bar');
      
      this.duration = 9500; // Total animation duration in ms
      this.hasEnded = false;
      
      document.body.classList.add('emergence-active');
      
      this.init();
    }
    
    init() {
      // Skip button
      if (this.skipButton) {
        this.skipButton.addEventListener('click', () => this.endEmergence());
      }
      
      // Auto-end after animation completes
      setTimeout(() => {
        if (!this.hasEnded) {
          this.endEmergence();
        }
      }, this.duration);
      
      // Keyboard skip (Enter or Space)
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !this.hasEnded) {
          e.preventDefault();
          this.endEmergence();
        }
      });
    }
    
    endEmergence() {
      if (this.hasEnded) return;
      this.hasEnded = true;
      
      // Hide emergence
      this.emergence.classList.add('hidden');
      document.body.classList.remove('emergence-active');
      
      // Show main content
      setTimeout(() => {
        this.mainContent.classList.add('visible');
        
        // Initialize main site features
        initMainSite();
      }, 500);
    }
  }

  // ============================================
  // Custom Cursor
  // ============================================
  class CustomCursor {
    constructor() {
      this.cursor = document.querySelector('.cursor');
      this.trail = document.querySelector('.cursor-trail');
      
      if (!this.cursor || !this.trail || this.isTouchDevice()) return;
      
      this.pos = { x: 0, y: 0 };
      this.trailPos = { x: 0, y: 0 };
      
      this.init();
    }
    
    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    
    init() {
      document.addEventListener('mousemove', (e) => {
        this.pos.x = e.clientX;
        this.pos.y = e.clientY;
      });
      
      // Hover effects
      const hoverElements = document.querySelectorAll(
        'a, button, .btn-magnetic, .passion-item, .nav-link'
      );
      
      hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
          this.cursor.classList.add('hovering');
          this.trail.classList.add('hovering');
        });
        el.addEventListener('mouseleave', () => {
          this.cursor.classList.remove('hovering');
          this.trail.classList.remove('hovering');
        });
      });
      
      this.animate();
    }
    
    animate() {
      const ease = 0.12;
      
      this.trailPos.x += (this.pos.x - this.trailPos.x) * ease;
      this.trailPos.y += (this.pos.y - this.trailPos.y) * ease;
      
      this.cursor.style.left = `${this.pos.x}px`;
      this.cursor.style.top = `${this.pos.y}px`;
      
      this.trail.style.left = `${this.trailPos.x}px`;
      this.trail.style.top = `${this.trailPos.y}px`;
      
      requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================
  // Magnetic Buttons
  // ============================================
  class MagneticButtons {
    constructor() {
      this.elements = document.querySelectorAll('.btn-magnetic');
      
      if (this.isTouchDevice()) return;
      
      this.init();
    }
    
    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    
    init() {
      this.elements.forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          
          el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });
        
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'translate(0, 0)';
        });
      });
    }
  }

  // ============================================
  // Scroll Reveal
  // ============================================
  class ScrollReveal {
    constructor() {
      this.elements = document.querySelectorAll('.passion-item, .about-text');
      
      // Check for native scroll animations
      if (CSS.supports('animation-timeline', 'scroll()')) {
        this.elements.forEach(el => el.classList.add('visible'));
        return;
      }
      
      this.init();
    }
    
    init() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, {
        root: null,
        rootMargin: '-50px',
        threshold: 0.15
      });
      
      this.elements.forEach(el => observer.observe(el));
    }
  }

  // ============================================
  // Smooth Scroll
  // ============================================
  class SmoothScroll {
    constructor() {
      document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href');
          if (href === '#') return;
          
          const target = document.querySelector(href);
          if (!target) return;
          
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  }

  // ============================================
  // Navigation Scroll Effect
  // ============================================
  class NavScroll {
    constructor() {
      this.nav = document.getElementById('nav');
      if (!this.nav) return;
      
      let ticking = false;
      
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            this.update();
            ticking = false;
          });
          ticking = true;
        }
      });
    }
    
    update() {
      const scrollY = window.scrollY;
      
      if (scrollY > 100) {
        this.nav.style.mixBlendMode = 'normal';
        this.nav.style.background = 'rgba(5, 5, 5, 0.9)';
        this.nav.style.backdropFilter = 'blur(20px)';
      } else {
        this.nav.style.mixBlendMode = 'difference';
        this.nav.style.background = 'transparent';
        this.nav.style.backdropFilter = 'none';
      }
    }
  }

  // ============================================
  // Parallax Blobs
  // ============================================
  class ParallaxBlobs {
    constructor() {
      this.blobs = document.querySelectorAll('.blob');
      
      if (!this.blobs.length) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      
      let ticking = false;
      
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            this.update();
            ticking = false;
          });
          ticking = true;
        }
      });
    }
    
    update() {
      const scrollY = window.scrollY;
      
      this.blobs.forEach((blob, i) => {
        const speed = (i + 1) * 0.02;
        blob.style.transform = `translateY(${scrollY * speed}px)`;
      });
    }
  }

  // ============================================
  // Title Character Hover
  // ============================================
  class TitleHover {
    constructor() {
      this.chars = document.querySelectorAll('.hero-title .char');
      
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      
      this.chars.forEach(char => {
        char.addEventListener('mouseenter', () => {
          char.style.animation = 'none';
          char.offsetHeight; // Trigger reflow
          char.style.animation = 'char-bounce 0.5s cubic-bezier(0.68, -0.6, 0.32, 1.6)';
        });
      });
    }
  }

  // Add character bounce animation
  const bounceStyle = document.createElement('style');
  bounceStyle.textContent = `
    @keyframes char-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-15px); }
    }
  `;
  document.head.appendChild(bounceStyle);

  // ============================================
  // Visual Frame 3D Tilt
  // ============================================
  class FrameTilt {
    constructor() {
      this.items = document.querySelectorAll('.passion-item');
      
      if (this.isTouchDevice()) return;
      
      this.items.forEach(item => {
        const frame = item.querySelector('.visual-frame');
        if (!frame) return;
        
        item.addEventListener('mousemove', (e) => {
          const rect = frame.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          const rotateX = (y - rect.height / 2) / 10;
          const rotateY = (rect.width / 2 - x) / 10;
          
          frame.style.transform = `
            perspective(1000px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            scale(1.05)
          `;
        });
        
        item.addEventListener('mouseleave', () => {
          frame.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
      });
    }
    
    isTouchDevice() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
  }

  // ============================================
  // Initialize Main Site
  // ============================================
  function initMainSite() {
    new CustomCursor();
    new MagneticButtons();
    new ScrollReveal();
    new SmoothScroll();
    new NavScroll();
    new ParallaxBlobs();
    new TitleHover();
    new FrameTilt();
    
    console.log('%c✦ bb.style', 'font-size: 24px; font-weight: bold; color: #e85d04;');
    console.log('%cNow she shines.', 'font-size: 12px; font-style: italic; color: #ffd60a;');
  }

  // ============================================
  // Check for Reduced Motion or Skip Preference
  // ============================================
  function init() {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Skip emergence entirely
      const emergence = document.getElementById('emergence');
      const mainContent = document.getElementById('main-content');
      
      if (emergence) emergence.style.display = 'none';
      if (mainContent) {
        mainContent.classList.add('visible');
        document.body.classList.remove('emergence-active');
      }
      
      initMainSite();
      return;
    }
    
    // Check if user has seen emergence before (optional localStorage check)
    const hasSeenEmergence = sessionStorage.getItem('bb-emergence-seen');
    
    if (hasSeenEmergence) {
      // Skip emergence
      const emergence = document.getElementById('emergence');
      const mainContent = document.getElementById('main-content');
      
      if (emergence) emergence.classList.add('hidden');
      if (mainContent) {
        mainContent.classList.add('visible');
        document.body.classList.remove('emergence-active');
      }
      
      initMainSite();
      return;
    }
    
    // Start emergence animation
    new EmergenceController();
    
    // Mark as seen for this session
    sessionStorage.setItem('bb-emergence-seen', 'true');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
