'use strict';

/**
 * Utils — shared, side-effect-free helpers used across all modules.
 * Exposed as window.Utils.
 */
(function () {

  window.Utils = Object.freeze({

    /** Escape a string for safe innerHTML injection. */
    esc(s) {
      return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
      );
    },

    /**
     * Return the CSS class for an element's archetype.
     * e.g. 'FRE' → 'arch-volatile'
     */
    archClass(id) {
      if (!id) return '';
      const el = window.ELEMENTS?.find(e => e.id === id);
      return el ? `arch-${el.archetype.toLowerCase()}` : '';
    },

    /**
     * Return the per-element CSS colour class.
     * e.g. 'FRE' → 'el-fre'
     */
    elClass(id) {
      return id ? `el-${id.toLowerCase()}` : '';
    },

    /**
     * Return the archetype abbreviation for an element id.
     * e.g. 'FRE' → 'VOL'
     */
    archAbbr(id) {
      if (!id) return '—';
      const el = window.ELEMENTS?.find(e => e.id === id);
      return el ? (window.ARCHETYPE_ABBR?.[el.archetype] ?? '?') : '—';
    },

    /**
     * Return the CSS variable name for an element's primary colour.
     * e.g. 'FRE' → 'var(--fre)'
     */
    elColorVar(id) {
      return id ? `var(--${id.toLowerCase()})` : 'var(--bg-card)';
    },

    /**
     * Return the CSS variable name for an element's dim background colour.
     * e.g. 'FRE' → 'var(--fre-dim)'
     */
    elDimVar(id) {
      return id ? `var(--${id.toLowerCase()}-dim)` : 'var(--bg-card)';
    },

  });

})();
