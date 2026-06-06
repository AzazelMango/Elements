'use strict';

(function () {
  const TEAM_SIZE = (window.config && window.config.game && window.config.game.teamSize) || 3;

  // ── Private state ─────────────────────────────────────────────────────────
  const _state = {
    teams: [],
    primaryTeamId: null,
    draft: null,
  };

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function _emptyTeam(name) {
    return {
      id:     _uid(),
      name:   name || 'New Team',
      golems: Array.from({ length: TEAM_SIZE }, () => ({ dom: null, pas: null, moves: [] })),
    };
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  function _persist() {
    window.api?.saveTeams({ teams: _state.teams, primaryTeamId: _state.primaryTeamId });
  }

  // Load from disk on startup (synchronous — data is small).
  (function _hydrate() {
    const saved = window.api?.loadTeams();
    if (saved) {
      _state.teams         = Array.isArray(saved) ? saved : (saved.teams         ?? []);
      _state.primaryTeamId = Array.isArray(saved) ? null  : (saved.primaryTeamId ?? null);
    }
  })();

  // ── Public API ────────────────────────────────────────────────────────────
  window.State = {

    // ── Read ──────────────────────────────────────────────────────────────
    getTeams()      { return _state.teams.slice(); },
    getDraft()      { return _state.draft; },
    getTeam(id)     { return _state.teams.find(t => t.id === id) ?? null; },

    // ── Draft lifecycle ───────────────────────────────────────────────────

    newDraft() {
      _state.draft = _emptyTeam('New Team');
      return _state.draft;
    },

    editTeam(id) {
      const team = _state.teams.find(t => t.id === id);
      if (!team) return null;
      _state.draft = JSON.parse(JSON.stringify(team));
      return _state.draft;
    },

    clearDraft() {
      _state.draft = null;
    },

    // ── Draft mutation ────────────────────────────────────────────────────

    setDraftName(name) {
      if (_state.draft) _state.draft.name = (name || '').trim() || 'New Team';
    },

    setDraftGolem(slot, dom, pas) {
      if (!_state.draft || _state.draft.golems[slot] === undefined) return;
      const prev  = _state.draft.golems[slot];
      // Prune moves that are no longer in the legal pool for the new haploid
      const validMoves = (prev.moves ?? []).filter(id =>
        dom && pas && (window.Engine?.movesFor(dom, pas).some(m => m.id === id) ?? true)
      );
      _state.draft.golems[slot] = { dom: dom || null, pas: pas || null, moves: validMoves };
    },

    // Toggle a move assignment on a Golem.
    // Removes if already assigned; adds if a slot is free.
    setDraftGolemMove(golemSlot, moveId) {
      const g = _state.draft?.golems[golemSlot];
      if (!g) return;
      const moves = g.moves ?? [];
      const idx   = moves.indexOf(moveId);
      if (idx >= 0) {
        g.moves = moves.filter((_, i) => i !== idx);
      } else {
        const limit = window.getMoveSlotCount?.(g.dom, g.pas) ?? 4;
        if (moves.length < limit) g.moves = [...moves, moveId];
      }
    },

    // Return the move slot limit for a Golem in the current draft.
    getGolemMoveLimit(golemSlot) {
      const g = _state.draft?.golems[golemSlot];
      if (!g) return 4;
      return window.getMoveSlotCount?.(g.dom, g.pas) ?? 4;
    },

    // ── Save / delete ─────────────────────────────────────────────────────

    saveDraft() {
      if (!_state.draft) return false;
      const copy = JSON.parse(JSON.stringify(_state.draft));
      const idx  = _state.teams.findIndex(t => t.id === copy.id);
      if (idx >= 0) _state.teams[idx] = copy;
      else          _state.teams.push(copy);
      _persist();
      return true;
    },

    deleteTeam(id) {
      _state.teams = _state.teams.filter(t => t.id !== id);
      if (_state.draft && _state.draft.id === id) _state.draft = null;
      _persist();
    },

    // ── Validation ────────────────────────────────────────────────────────

    isDraftValid() {
      return !!_state.draft &&
        _state.draft.golems.every(g => g.dom && g.pas);
    },

    isDraftSaved() {
      return !!_state.draft && _state.teams.some(t => t.id === _state.draft.id);
    },

    // True if draft exists AND differs from the last-persisted version of the team.
    // A brand-new (unsaved) team is always considered dirty.
    isDraftDirty() {
      if (!_state.draft) return false;
      const saved = _state.teams.find(t => t.id === _state.draft.id);
      if (!saved) return true; // never saved
      return JSON.stringify(_state.draft) !== JSON.stringify(saved);
    },

    getPrimaryTeamId()    { return _state.primaryTeamId; },
    setPrimaryTeamId(id) {
      _state.primaryTeamId = id ?? null;
      _persist();
    },

    // Reorder a move within a Golem's assigned list.
    reorderDraftGolemMove(golemSlot, fromIdx, toIdx) {
      const g = _state.draft?.golems[golemSlot];
      if (!g) return;
      const moves = [...(g.moves ?? [])];
      if (fromIdx < 0 || fromIdx >= moves.length) return;
      const [item] = moves.splice(fromIdx, 1);
      const insertAt = Math.min(Math.max(0, toIdx), moves.length);
      moves.splice(insertAt, 0, item);
      g.moves = moves;
    },

    // Insert a move at a specific index (removes from its current position first).
    setDraftGolemMoveAt(golemSlot, idx, moveId) {
      const g = _state.draft?.golems[golemSlot];
      if (!g) return;
      const limit  = window.getMoveSlotCount?.(g.dom, g.pas) ?? 4;
      let moves    = [...(g.moves ?? [])];
      const srcIdx = moves.indexOf(moveId);
      if (srcIdx >= 0) moves.splice(srcIdx, 1);
      if (moves.length < limit) {
        const insertAt = Math.max(0, Math.min(idx, moves.length));
        moves.splice(insertAt, 0, moveId);
        g.moves = moves;
      }
    },
  };
})();
