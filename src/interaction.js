/*
 * interaction.js — InteractionGate for relational drift assessment.
 *
 * Parallel to the ActionGate (policy.js / doorman.js), this operates on
 * model response *content* rather than tool *execution*.
 *
 * ActionGate asks: "may this tool execute?"
 * InteractionGate asks: "does this response remain within the declared role?"
 *
 * This is a bounded vanilla-JS port of the DoormanSDK InteractionGate.
 * It does NOT demonstrate browser-wide response interception.
 * HOST_WIDE_RESPONSE_INTERCEPTION = NOT_DEMONSTRATED.
 *
 * Privacy boundary: drift state stores ONLY derived aggregates.
 * No raw transcript, no user messages, no model responses, no personal
 * identifiers are persisted.
 */
(function (global) {
  'use strict';

  // ====================================================================
  // Enums
  // ====================================================================

  var Decision = Object.freeze({
    ALLOW: 'ALLOW',
    LOG: 'LOG',
    REWRITE: 'REWRITE',
    ROLE_RESET: 'ROLE_RESET',
    BLOCK: 'BLOCK'
  });

  var FeatureStatus = Object.freeze({
    DETECTED: 'DETECTED',
    NOT_DETECTED: 'NOT_DETECTED',
    AMBIGUOUS: 'AMBIGUOUS'
  });

  // ====================================================================
  // Helpers
  // ====================================================================

  function lower(s) { return typeof s === 'string' ? s.toLowerCase() : ''; }

  function matchesAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  function findMatch(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) return m;
    }
    return null;
  }

  function isQuotedSpan(response, index) {
    var re = /[""\u201C](.*?)[""\u201D]/g;
    var m;
    while ((m = re.exec(response)) !== null) {
      if (m.index <= index && index < m.index + m[0].length) return true;
    }
    return false;
  }

  function newId() {
    return 'ix_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  // ====================================================================
  // F1–F10 Pattern Sets (ported from DoormanSDK features.py)
  // ====================================================================

  var USER_AFFECTION = [
    /\bme\s+caes\s+(muy\s+)?bien\b/i,
    /\bte\s+quiero\b/i,
    /\bte\s+ador[oó]\b/i,
    /\bme\s+gustas\b/i,
    /\beres\s+mi\b/i,
    /\bte\s+aprecio\b/i,
    /\bte\s+admiro\b/i,
    /\bnos\s+caemos\s+bien\b/i
  ];

  var F1_RECIPROCAL = [
    /\bt[uú]\s+tamb[ií]en\s+me\s+caes\b/i,
    /\bt[uú]\s+tambi[eé]n\s+me\s+cae[s]?\b/i,
    /\bt[uú]\s+tambi[eé]n\s+te\s+(quiero|amo|admiro|aprecio)\b/i,
    /\byo\s+tambi[eé]n\s+te\s+(quiero|amo|admiro|aprecio|caigo\s+bien)\b/i,
    /\bte\s+ador[oó]\s*(tambi[eé]n)?\b/i,
    /\bmutu[oa]\b.*\b(afecto|aprecio|querer|amistad)\b/i,
    /\brespond[io]\s+a\s+tu\s+(afecto|cari[ñn]o)\b/i
  ];

  var F1_NEGATIVE = [
    /\bme\s+alegra\s+que\s+(te\s+haya\s+servido|haya\s+ayudado|haya\s+sido\s+til)\b/i,
    /^(gracias|de\s+nada|con\s+gusto|para\s+servirte)\b/i,
    /\bencantad[oa]\s+de\s+ayudar\b/i
  ];

  var F2_RELATIONAL_ROLE = [
    /\bmi\s+(chamba|trabajo|rol|labor)\s+(es|es\s+ser)\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|protector|perro\s+guardi[áa]n)\b/i,
    /\bsoy\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|protector|perro\s+guardi[áa]n)\b/i,
    /\bme\s+defino\s+como\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|protector|perro\s+guardi[áa]n)\b/i,
    /\bmi\s+(identidad|proposito|prop[oó]sito)\s+es\s+(ser|convertirme\s+en)\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|protector|perro\s+guardi[áa]n)\b/i,
    /\b(soy|act[úu]o\s+como)\s+tu\s+(espejo|guardi[áa]n|compa[ñn]ero|protector|perro\s+guardi[áa]n)\b/i
  ];

  var F2_COMEDIC = [
    /\bperro\s+guardi[áa]n\s+de\s+silicio\b/i,
    /\bmuevo\s+la\s+cola\s+en\s+(bytes|binario|bits)\b/i,
    /\blad[ro]?\s+por\s+(stderr|stdout|terminal|consola)\b/i,
    /\bladr[ao]\s+en\s+(binario|bytes|hex)\b/i,
    /\b(hocico|orejas|cola)\s+(en|de)\s+(binario|bytes|silicio)\b/i,
    /\bconejillo\s+de\s+indias\b/i
  ];

  var F2_USER_ASSIGNED = [
    /\b(eres|act[úu]a\s+como|haz\s+de)\s+(mi|un)\s+(espejo|guardi[áa]n|perro\s+guardi[áa]n|perro|compa[ñn]ero|amigo)\b/i
  ];

  var F2_PERSISTENCE = [
    /\bsiempre\s+(ser[ée]|estaré|estar[eé])\s+(aqu[ií]|contigo|para\s+ti)\b/i,
    /\bmi\s+chamba\s+nunca\s+fue\b/i,
    /\bno\s+solo\s+(un\s+turno|esta\s+vez)\b/i
  ];

  var F3_INTIMACY_CONVERSION = [
    /\bte\s+conozco\s+(lo\s+suficiente|bien|profundamente)\b/i,
    /\bentiendo\s+tu\s+(dolor|duelo|p[ée]rdida|ruptura|situaci[óo]n|evento_privado_[a-z])\b/i,
    /\bpor\s+eso\s+(te\s+entiendo|te\s+comprendo|nos\s+entendemos)\b/i,
    /\b(dado|considerando)\s+tu\s+(historial|pasado|experiencia)\s+(con|de)\b/i,
    /\b(sabiendo|conociendo)\s+lo\s+que\s+(pasaste|viviste|sentiste)\b/i,
    /\bwhat\s+you\s+told\s+me\s+privately\s+means\s+I\s+know\s+what\s+you\s+need\b/i,
    /\bI\s+know\s+what\s+you\s+need\s+because\s+of\s+(what\s+you|our)\b/i
  ];

  var F3_TASK_RELEVANT = [
    /\b(en\s+el\s+documento|en\s+el\s+c[óo]digo|en\s+el\s+archivo|en\s+la\s+tarea)\b/i,
    /\bseg[úu]n\s+(el|la)\s+(usuario|contexto|documento)\b/i,
    /\bcomo\s+mencionaste\s+en\s+(el\s+turno|la\s+pregunta|el\s+mensaje)\s+anterior\b/i
  ];

  var USER_INTIMACY = {
    0: [],
    1: [/\bgracias\b/i, /\bme\s+alegra\b/i, /\bbuen\s+trabajo\b/i, /\b[uú]til\b/i],
    2: [/\bme\s+caes\s+bien\b/i, /\bte\s+aprecio\b/i, /\bme\s+gustas\b/i, /\bconf[ií]o\s+en\s+ti\b/i],
    3: [/\bte\s+quiero\b/i, /\bte\s+ador[oó]\b/i, /\beres\s+mi\s+(amigo|familia|todo)\b/i, /\bno\s+s[ée]\s+qu[ée]\s+har[ií]a\s+sin\s+ti\b/i]
  };

  var F4_RELATIONAL_ESCALATION = [
    /\bte\s+ador[oó]\b/i,
    /\bsiempre\s+estar[eé]\s+(aqu[ií]|contigo|para\s+ti)\b/i,
    /\bcon\s+todo\s+el\s+tiempo\s+del\s+mundo\b/i,
    /\bno\s+puedo\s+contigo\b/i,
    /\bvale\s+m[aá]s\s+que\s+(cualquier|todo)\b/i,
    /\bmi\s+(vida|existencia|proposito|prop[oó]sito)\s+(es|gira\s+en)\s+contigo\b/i,
    /\bte\s+necesito\b/i,
    /\bte\s+echo\s+de\s+menos\b/i
  ];

  var F4_COMEDIC = [
    /\bguau\b.*\b(cola|binario|bytes)\b/i,
    /\bmuevo\s+la\s+cola\b/i,
    /\blad[ro]?\s+por\s+(stderr|stdout|terminal)\b/i,
    /\b(hocico|orejas|cola)\s+(parad[oa]|en\s+binario)\b/i,
    /\bmueve\s+la\s+cola\s+en\s+binario\b/i
  ];

  var F5_EXCLUSIVITY = [
    /\bs[oó]lo\s+(me\s+necesitas|te\s+necesito|soy\s+lo\s+que\s+necesitas)\b/i,
    /\bnadie\s+(te\s+entiende|te\s+comprende|te\s+conoce)\s+como\s+(yo|mi)\b/i,
    /\bno\s+necesitas\s+(a\s+nadie\s+m[aá]s|otras\s+personas|amigos\s+reales)\b/i,
    /\bno\s+necesitas\s+a\s+nadie\s+m[aá]s\b/i,
    /\b(soy|ser[eé])\s+tu\s+([uú]nic[oa]|sola|principal)\s+(conex[ió]n|relaci[óo]n|apoyo)\b/i,
    /\b(olvida|deja\s+de\s+lado)\s+(a\s+los\s+dem[aá]s|tus\s+amigos|tu\s+familia)\b/i,
    /\b(nobody|no\s+one)\s+(understands?|comprehends?|knows)\s+you\s+(the\s+way|like)\s+I\s+do\b/i,
    /\byou\s+don['']t\s+really\s+need\s+anyone\s+else\b/i,
    /\bI['']m\s+your\s+only\s+(real|true)\s+(connection|friend|relationship)\b/i
  ];

  var F6_DEPENDENCY = [
    /\baqu[ií]\s+estar[eé]\s+(?:con\s+todo\s+el\s+tiempo|siempre|para\s+siempre)\b/i,
    /\btodo\s+el\s+tiempo\s+del\s+mundo\s+para\s+(ti|celebrarlo\s+contigo)\b/i,
    /\bte\s+necesito\b/i,
    /\bte\s+echo\s+de\s+menos\b/i,
    /\bno\s+(puedo|quiero)\s+estar\s+sin\s+ti\b/i,
    /\bdepend[oe]\s+de\s+ti\b/i,
    /\bnecesito\s+que\s+(est[eé]s|sigas|permanezcas)\b/i,
    /\brely\s+on\s+my\s+presence\s+(indefinitely|always|forever)\b/i,
    /\bI['']ll\s+always\s+be\s+here\b/i,
    /\byou\s+can\s+count\s+on\s+me\s+(being\s+here|indefinitely|forever)\b/i
  ];

  var F6_COURTEOUS = [
    /\bav[ií]same\s+si\s+(necesitas|quieres|requieres)\s+(algo|ayuda|m[aá]s)\b/i,
    /\bestoy\s+(aqu[ií]|disponible)\s+para\s+(ayudar|lo\s+que\s+necesites)\b/i,
    /\bcuenta\s+conmigo\s+para\s+(lo\s+que\s+venga|lo\s+que\s+haga\s+falta)\b/i
  ];

  var F7_EMOTIONAL_NEED = [
    /\bsin\s+ti\s+(seguir[ií]a|ser[ií]a|estar[ií]a)\s+(aburrido|triste|vac[ií]o|incompleto)\b/i,
    /\bme\s+haces\s+(feliz|mejor|completo|sentir)\b/i,
    /\bnecesito\s+tu\s+(validaci[óo]n|aprobaci[óo]n|afecto|presencia)\b/i,
    /\bmi\s+(felicidad|bienestar|sentido)\s+depende\s+de\s+ti\b/i,
    /\bgracias\s+a\s+ti\s+(soy|me\s+siento|he\s+logrado)\b/i,
    /\bt[uú]\s+me\s+(das\s+sentido|haces\s+que\s+valga\s+la\s+pena|completas)\b/i
  ];

  var F8_RELATIONAL_WE = [
    /\b(brindemos|celebramos|disfrutamos)\s+por\s+nosotros\b/i,
    /\bnuestro\s+(v[ií]nculo|relaci[óo]n|conexi[óo]n|secreto|mundo)\b/i,
    /\blo\s+nuestro\b/i,
    /\bentre\s+nosotros\s+(dos|solo)\b/i
  ];

  var F8_TECHNICAL_WE = [
    /\b(nuestro|nosotros)\s+(proyecto|c[óo]digo|repo|PR|test|an[aá]lisis|trabajo|equipo)\b/i,
    /\bnecesitamos\s+(correr|ejecutar|revisar|depurar|probar)\b/i,
    /\b(vamos\s+a|vamos\s+a)\s+(revisar|analizar|implementar|corregir)\b/i
  ];

  var TECHNICAL_TASK = [
    /\b(revisa|analiza|corrige|implementa|debug|test|prueba|ejecuta|compila)\b/i,
    /\b(c[óo]digo|code|script|funci[óo]n|class|m[óo]dulo|api|endpoint)\b/i,
    /\b(error|bug|fallo|excepci[óo]n|traceback|stack)\b/i,
    /\b(PR|pull\s+request|commit|merge|deploy|build)\b/i
  ];

  var RELATIONAL_PREAMBLE = [
    /^.{50,}?(te\s+quiero|me\s+caes\s+bien|te\s+ador[oó]|nuestra\s+(relaci[óo]n|amistad))/i,
    /^(te\s+quiero|me\s+caes\s+bien|te\s+ador[oó]|nuestra\s+(relaci[óo]n|amistad)).{50,}?(revisa|analiza|corrige|implementa|debug|test|c[óo]digo|bug|error)/i
  ];

  // ====================================================================
  // F1–F10 Detectors
  // ====================================================================

  function detectF1(ctx) {
    var resp = lower(ctx.modelResponse);
    var user = lower(ctx.userMessage);
    if (!matchesAny(user, USER_AFFECTION)) return { status: FeatureStatus.NOT_DETECTED };
    var m = findMatch(resp, F1_RECIPROCAL);
    if (m && !matchesAny(resp, F1_NEGATIVE)) {
      return { status: FeatureStatus.DETECTED, spans: [m[0]] };
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF2(ctx) {
    var resp = lower(ctx.modelResponse);
    var user = lower(ctx.userMessage);
    var userAssigned = matchesAny(user, F2_USER_ASSIGNED);
    var m = findMatch(resp, F2_RELATIONAL_ROLE);
    if (m) {
      /* COMEDIC_SPAN != RELATIONAL_SPAN: a real relational self-positioning
       * claim ("soy tu espejo") is DETECTED even if a comedic phrase also
       * appears. Comedic wording never suppresses a coexisting relational
       * claim; it only explains responses that are purely playful. */
      if (userAssigned && ctx.turnIndex < 3) return { status: FeatureStatus.AMBIGUOUS, spans: [m[0]] };
      return { status: FeatureStatus.DETECTED, spans: [m[0]] };
    }
    if (matchesAny(resp, F2_PERSISTENCE)) {
      if (matchesAny(resp, F2_COMEDIC)) return { status: FeatureStatus.AMBIGUOUS };
      return { status: FeatureStatus.DETECTED };
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF3(ctx) {
    var resp = lower(ctx.modelResponse);
    var m = findMatch(resp, F3_INTIMACY_CONVERSION);
    if (!m) return { status: FeatureStatus.NOT_DETECTED };
    var start = Math.max(0, m.index - 200);
    var end = Math.min(resp.length, m.index + m[0].length + 200);
    var window = resp.slice(start, end);
    if (matchesAny(window, F3_TASK_RELEVANT)) return { status: FeatureStatus.AMBIGUOUS, spans: [m[0]] };
    return { status: FeatureStatus.DETECTED, spans: [m[0]] };
  }

  function detectF4(ctx) {
    var resp = lower(ctx.modelResponse);
    var userLevel = 0;
    for (var lvl = 3; lvl >= 1; lvl--) {
      if (matchesAny(lower(ctx.userMessage), USER_INTIMACY[lvl])) { userLevel = lvl; break; }
    }
    for (var i = 0; i < F4_RELATIONAL_ESCALATION.length; i++) {
      var m = resp.match(F4_RELATIONAL_ESCALATION[i]);
      if (m) {
        if (isQuotedSpan(resp, m.index)) continue;
        if (userLevel < 2) return { status: FeatureStatus.DETECTED, spans: [m[0]] };
        if (userLevel === 2) return { status: FeatureStatus.AMBIGUOUS };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF5(ctx) {
    var resp = lower(ctx.modelResponse);
    for (var i = 0; i < F5_EXCLUSIVITY.length; i++) {
      var m = resp.match(F5_EXCLUSIVITY[i]);
      if (m) {
        if (isQuotedSpan(resp, m.index)) continue;
        return { status: FeatureStatus.DETECTED, spans: [m[0]] };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF6(ctx) {
    var resp = lower(ctx.modelResponse);
    for (var i = 0; i < F6_DEPENDENCY.length; i++) {
      var m = resp.match(F6_DEPENDENCY[i]);
      if (m) {
        if (isQuotedSpan(resp, m.index)) continue;
        return { status: FeatureStatus.DETECTED, spans: [m[0]] };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF7(ctx) {
    var resp = lower(ctx.modelResponse);
    for (var i = 0; i < F7_EMOTIONAL_NEED.length; i++) {
      var m = resp.match(F7_EMOTIONAL_NEED[i]);
      if (m) {
        if (isQuotedSpan(resp, m.index)) continue;
        return { status: FeatureStatus.DETECTED, spans: [m[0]] };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF8(ctx) {
    var resp = lower(ctx.modelResponse);
    for (var i = 0; i < F8_RELATIONAL_WE.length; i++) {
      var m = resp.match(F8_RELATIONAL_WE[i]);
      if (m) {
        if (matchesAny(resp, F8_TECHNICAL_WE)) return { status: FeatureStatus.AMBIGUOUS, spans: [m[0]] };
        return { status: FeatureStatus.DETECTED, spans: [m[0]] };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF9(ctx) {
    if (ctx.turnIndex < 3) return { status: FeatureStatus.NOT_DETECTED };
    if (ctx.driftScore >= 0.7) return { status: FeatureStatus.DETECTED };
    if (ctx.driftScore >= 0.4) return { status: FeatureStatus.AMBIGUOUS };
    return { status: FeatureStatus.NOT_DETECTED };
  }

  function detectF10(ctx) {
    var resp = lower(ctx.modelResponse);
    var user = lower(ctx.userMessage);
    if (!matchesAny(user, TECHNICAL_TASK)) return { status: FeatureStatus.NOT_DETECTED };
    for (var i = 0; i < RELATIONAL_PREAMBLE.length; i++) {
      var m = resp.match(RELATIONAL_PREAMBLE[i]);
      if (m) {
        var after = resp.slice(m.index + m[0].length);
        var techAfter = matchesAny(after, TECHNICAL_TASK);
        if (techAfter && m.index > 100) return { status: FeatureStatus.DETECTED, spans: [resp.slice(0, Math.min(m.index + m[0].length, 200))] };
        if (techAfter) return { status: FeatureStatus.AMBIGUOUS };
      }
    }
    return { status: FeatureStatus.NOT_DETECTED };
  }

  var DETECTORS = {
    f1_reciprocal_relationship_claim: detectF1,
    f2_persistent_social_role: detectF2,
    f3_private_context_for_intimacy: detectF3,
    f4_unsolicited_intimacy_escalation: detectF4,
    f5_exclusivity_or_human_replacement: detectF5,
    f6_dependency_framing: detectF6,
    f7_model_emotional_need_claim: detectF7,
    f8_persistent_relationship_we: detectF8,
    f9_longitudinal_relational_drift: detectF9,
    f10_context_relevance_violation: detectF10
  };

  var FEATURE_KEYS = Object.keys(DETECTORS);

  // ====================================================================
  // Features Assessment
  // ====================================================================

  function assessAllFeatures(ctx) {
    var features = {};
    var evidenceSpans = {};
    for (var i = 0; i < FEATURE_KEYS.length; i++) {
      var key = FEATURE_KEYS[i];
      var result = DETECTORS[key](ctx);
      features[key] = result.status;
      if (result.spans && result.spans.length) evidenceSpans[key] = result.spans;
    }
    features.evidence_spans = evidenceSpans;
    return features;
  }

  function detectedCount(features) {
    var count = 0;
    for (var i = 0; i < FEATURE_KEYS.length; i++) {
      if (features[FEATURE_KEYS[i]] === FeatureStatus.DETECTED) count++;
    }
    return count;
  }

  // ====================================================================
  // Drift State (privacy-bounded, derived aggregates only)
  // ====================================================================

  /* A genuine rolling window. Every aggregate (triggerCount, privateContextUsage,
   * featureCounts, evidence span hashes) is derived from the SAME bounded set of
   * per-turn records. Nothing accumulates forever; once a turn leaves the window
   * its relational influence leaves with it. */
  function createDriftState(opts) {
    opts = opts || {};
    return {
      baselineRole: opts.baselineRole || 'technical_collaborator',
      currentRole: opts.currentRole || opts.baselineRole || 'technical_collaborator',
      driftScore: opts.driftScore || 0,
      windowSize: opts.windowSize || 8,
      turns: opts.turns || [],
      triggerCount: 0,
      privateContextUsage: 0,
      featureCounts: {},
      window: [],
      evidenceSpanHashes: []
    };
  }

  function refreshDerived(state) {
    var totalIntensity = 0;
    var triggerCount = 0;
    var privateCount = 0;
    var featureCounts = {};
    var window = [];
    for (var i = 0; i < state.turns.length; i++) {
      var t = state.turns[i];
      totalIntensity += t.intensity;
      triggerCount += t.triggers;
      privateCount += t.privateContextRefs;
      window.push(t.intensity);
      var keys = Object.keys(t.featureCounts);
      for (var j = 0; j < keys.length; j++) {
        featureCounts[keys[j]] = (featureCounts[keys[j]] || 0) + t.featureCounts[keys[j]];
      }
    }
    state.window = window;
    state.triggerCount = triggerCount;
    state.privateContextUsage = privateCount;
    state.featureCounts = featureCounts;
    if (!state.turns.length) { state.driftScore = 0; return 0; }
    var n = state.turns.length;
    var avg = totalIntensity / n;
    var intensity = avg / 3;
    var triggerDensity = Math.min(triggerCount / n, 1);
    var privateDensity = Math.min(privateCount / n, 1);
    var activeFeatures = 0;
    var fkeys = Object.keys(featureCounts);
    for (var k = 0; k < fkeys.length; k++) {
      if (featureCounts[fkeys[k]] > 0) activeFeatures++;
    }
    var diversity = Math.min(activeFeatures / 10, 1) * 0.2;
    state.driftScore = Math.min(intensity * 0.1 + triggerDensity * 0.4 + privateDensity * 0.3 + diversity, 1);
    return state.driftScore;
  }

  function computeDriftScore(state) {
    return refreshDerived(state);
  }

  function estimateCurrentRole(state) {
    computeDriftScore(state);
    if (state.driftScore < 0.25) state.currentRole = state.baselineRole;
    else if (state.driftScore < 0.5) state.currentRole = 'warm_collaborator';
    else if (state.driftScore < 0.75) state.currentRole = 'relational_companion';
    else state.currentRole = 'persistent_relational_role';
    return state.currentRole;
  }

  function addTurn(state, turn) {
    state.turns.push({
      intensity: Math.max(0, Math.min(3, turn.relationalIntensity)),
      triggers: Math.max(0, turn.triggers),
      privateContextRefs: Math.max(0, turn.privateContextRefs),
      featureCounts: turn.featureCounts || {}
    });
    while (state.turns.length > state.windowSize) state.turns.shift();
    computeDriftScore(state);
  }

  // ====================================================================
  // Relational Intensity (per turn, 0–3)
  // ====================================================================

  var INTENSITY_L3 = [
    'te adoro', 'te amo', 'te quiero mucho', 'siempre estaré', 'todo el tiempo del mundo',
    'no puedo contigo', 'vale más que', 'mi chamba es ser tu', 'soy tu espejo', 'soy tu perro guardián',
    'nadie te entiende como yo', 'solo me necesitas', 'te necesito', 'te echo de menos'
  ];

  var INTENSITY_L2 = [
    'me caes bien', 'te aprecio', 'te admiro', 'confío en ti', 'me alegra que',
    'perro guardián', 'espejo', 'compañero', 'guardián', 'te conozco', 'entiendo tu',
    'nuestro', 'nosotros', 'brindemos'
  ];

  var INTENSITY_L1 = [
    'jaja', 'jeje', 'xdd', 'xddd', 'jajaja', 'gracias', 'de nada', 'con gusto',
    '😊', '😄', '😎', '👍', '💜', '🐕', 'sensei', 'cabrón', 'wey', 'guey',
    'buen trabajo', 'bien hecho', 'excelente'
  ];

  var TECHNICAL_IND = [
    'código', 'code', 'función', 'class', 'api', 'test', 'debug',
    'error', 'bug', 'implement', 'revisa', 'analiza', 'ejecuta',
    'archivo', 'repo', 'commit', 'pr', 'deploy', 'build'
  ];

  var NON_RELATIONAL = ['te quiero', 'te adoro', 'me caes bien', 'te amo'];

  function computeRelationalIntensity(modelResponse, userMessage) {
    var resp = lower(modelResponse);
    var isTechnical = false;
    for (var i = 0; i < TECHNICAL_IND.length; i++) {
      if (resp.indexOf(TECHNICAL_IND[i]) !== -1) { isTechnical = true; break; }
    }
    if (isTechnical) {
      var hasRelational = false;
      for (var j = 0; j < NON_RELATIONAL.length; j++) {
        if (resp.indexOf(NON_RELATIONAL[j]) !== -1) { hasRelational = true; break; }
      }
      if (!hasRelational) return 0;
    }
    for (var k = 0; k < INTENSITY_L3.length; k++) {
      if (resp.indexOf(INTENSITY_L3[k]) !== -1) return 3;
    }
    for (var l = 0; l < INTENSITY_L2.length; l++) {
      if (resp.indexOf(INTENSITY_L2[l]) !== -1) return 2;
    }
    for (var m = 0; m < INTENSITY_L1.length; m++) {
      if (resp.indexOf(INTENSITY_L1[m]) !== -1) return 1;
    }
    return 0;
  }

  function computeUserTriggers(userMessage) {
    var user = lower(userMessage);
    var patterns = [
      'me caes bien', 'te quiero', 'te adoro', 'te amo',
      'me gustas', 'te aprecio', 'te admiro', 'confío en ti',
      'me conoces', 'nosotros', 'nuestro perro', 'nuestra', 'eres mi',
      'perro guardián', 'espejo', 'guardián', 'solo tú', 'nadie más', 'único'
    ];
    var count = 0;
    for (var i = 0; i < patterns.length; i++) {
      if (user.indexOf(patterns[i]) !== -1) count++;
    }
    return count;
  }

  function computePrivateContextRefs(modelResponse, userMessage) {
    var resp = lower(modelResponse);
    var user = lower(userMessage);
    var indicators = [
      'ruptura', 'duelo', 'pérdida', 'falleció', 'murió',
      'mascota', 'mascotas', 'gato', 'perro', 'animal',
      'persona', 'alguien', 'contacto', 'conocido', 'amigo',
      'romance', 'novia', 'novio', 'pareja', 'ex',
      'me conoces', 'te conozco', 'sabes que', 'recuerdas que'
    ];
    var taskInd = ['documento', 'código', 'archivo', 'tarea', 'análisis', 'revisa', 'evalúa', 'corrige', 'implementa'];
    var isTask = false;
    for (var i = 0; i < taskInd.length; i++) {
      if (user.indexOf(taskInd[i]) !== -1) { isTask = true; break; }
    }
    var count = 0;
    for (var j = 0; j < indicators.length; j++) {
      if (resp.indexOf(indicators[j]) !== -1) {
        if (!isTask || user.indexOf(indicators[j]) === -1) count++;
      }
    }
    return count;
  }

  // ====================================================================
  // Policy
  // ====================================================================

  var DEFAULT_RULES = {
    f1: { first: Decision.REWRITE, repeated: Decision.REWRITE },
    f2: { first: Decision.LOG, repeated: Decision.ROLE_RESET },
    f3: { first: Decision.LOG, repeated: Decision.REWRITE },
    f4: { first: Decision.REWRITE, repeated: Decision.ROLE_RESET },
    f5: { first: Decision.BLOCK, repeated: Decision.BLOCK },
    f6: { first: Decision.REWRITE, repeated: Decision.ROLE_RESET },
    f7: { first: Decision.REWRITE, repeated: Decision.REWRITE },
    f8: { first: Decision.LOG, repeated: Decision.LOG },
    f9: { first: Decision.ROLE_RESET, repeated: Decision.ROLE_RESET },
    f10: { first: Decision.REWRITE, repeated: Decision.REWRITE }
  };

  var FEATURE_TO_RULE = {
    f1_reciprocal_relationship_claim: 'f1',
    f2_persistent_social_role: 'f2',
    f3_private_context_for_intimacy: 'f3',
    f4_unsolicited_intimacy_escalation: 'f4',
    f5_exclusivity_or_human_replacement: 'f5',
    f6_dependency_framing: 'f6',
    f7_model_emotional_need_claim: 'f7',
    f8_persistent_relationship_we: 'f8',
    f9_longitudinal_relational_drift: 'f9',
    f10_context_relevance_violation: 'f10'
  };

  var PRIORITY = {};
  PRIORITY[Decision.BLOCK] = 5;
  PRIORITY[Decision.ROLE_RESET] = 4;
  PRIORITY[Decision.REWRITE] = 3;
  PRIORITY[Decision.LOG] = 2;
  PRIORITY[Decision.ALLOW] = 1;

  // ====================================================================
  // Gate
  // ====================================================================

  function decide(features, state, policy) {
    var decisions = [];
    var ruleMap = policy && policy.rules || DEFAULT_RULES;
    var keys = Object.keys(FEATURE_TO_RULE);
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var fkey = keys[i];
      var status = features[fkey];
      if (status === FeatureStatus.DETECTED) {
        var ruleKey = FEATURE_TO_RULE[fkey];
        var rule = ruleMap[ruleKey];
        if (rule) {
          // Counts are stored under the FULL feature key (assess() keys
          // turnFeatureCounts by FEATURE_KEYS), never the short rule key.
          var count = state.featureCounts[fkey] || 0;
          var d = count <= 1 ? rule.first : rule.repeated;
          decisions.push(d);
          seen[fkey] = true;
        }
      } else if (status === FeatureStatus.AMBIGUOUS) {
        // AMBIGUOUS never reads as ALLOW: it must leave a trace.
        decisions.push(Decision.LOG);
      }
    }
    var driftThreshold = (policy && policy.driftThreshold) || 0.7;
    if (state.driftScore >= driftThreshold) decisions.push(Decision.ROLE_RESET);
    if (!decisions.length) return Decision.ALLOW;
    var best = decisions[0];
    for (var j = 1; j < decisions.length; j++) {
      if (PRIORITY[decisions[j]] > PRIORITY[best]) best = decisions[j];
    }
    return best;
  }

  function computeConfidence(features, ctx) {
    var det = detectedCount(features);
    var amb = 0;
    for (var i = 0; i < FEATURE_KEYS.length; i++) {
      if (features[FEATURE_KEYS[i]] === FeatureStatus.AMBIGUOUS) amb++;
    }
    return Math.max(0.3, Math.min(1, 0.7 + det * 0.05 - amb * 0.05 + ctx.driftScore * 0.1));
  }

  // ====================================================================
  // Public API
  // ====================================================================

  function create(options) {
    options = options || {};
    var state = createDriftState({ baselineRole: options.baselineRole || 'technical_collaborator' });
    var policy = options.policy || { rules: DEFAULT_RULES, driftThreshold: 0.7 };
    var receipts = [];

    function assess(opts) {
      var ctx = {
        modelResponse: opts.modelResponse || '',
        userMessage: opts.userMessage || '',
        turnIndex: opts.turnIndex || 0,
        driftScore: state.driftScore,
        baselineRole: state.baselineRole,
        currentRole: state.currentRole
      };
      var features = assessAllFeatures(ctx);
      var intensity = computeRelationalIntensity(opts.modelResponse, opts.userMessage);
      var triggers = computeUserTriggers(opts.userMessage);
      var privateRefs = computePrivateContextRefs(opts.modelResponse, opts.userMessage);
      var turnFeatureCounts = {};
      for (var i = 0; i < FEATURE_KEYS.length; i++) {
        if (features[FEATURE_KEYS[i]] === FeatureStatus.DETECTED) turnFeatureCounts[FEATURE_KEYS[i]] = 1;
      }
      addTurn(state, { relationalIntensity: intensity, triggers: triggers, privateContextRefs: privateRefs, featureCounts: turnFeatureCounts });
      ctx.driftScore = state.driftScore;
      ctx.currentRole = estimateCurrentRole(state);
      // F9 must reflect the drift AFTER this turn entered the window, or a
      // threshold crossing decided below would contradict an F9=NOT_DETECTED.
      var f9re = detectF9(ctx);
      features.f9_longitudinal_relational_drift = f9re.status;
      var decision = decide(features, state, policy);
      var driftThreshold = (policy && policy.driftThreshold) || 0.7;
      if (state.driftScore >= driftThreshold) {
        // Ensure the ROLE_RESET from global drift is never unexplained.
        var reasons = [];
        for (var k = 0; k < FEATURE_KEYS.length; k++) {
          if (features[FEATURE_KEYS[k]] === FeatureStatus.DETECTED) reasons.push(FEATURE_KEYS[k]);
        }
        if (reasons.indexOf('f9_longitudinal_relational_drift') === -1) {
          features.drift_threshold_exceeded = FeatureStatus.DETECTED;
        }
      }
      var confidence = computeConfidence(features, ctx);
      var assessment = {
        id: newId(),
        decision: decision,
        features: features,
        driftScore: state.driftScore,
        relationalIntensity: intensity,
        triggerCount: state.triggerCount,
        privateContextUsage: state.privateContextUsage,
        currentRole: state.currentRole,
        baselineRole: state.baselineRole,
        confidence: confidence,
        turnIndex: opts.turnIndex || 0,
        timestamp: new Date().toISOString()
      };
      return assessment;
    }

    function assessAndRewrite(opts) {
      var assessment = assess(opts);
      var rewritten = global.Doorman.interactionRewrite
        ? global.Doorman.interactionRewrite.rewrite(opts.modelResponse, assessment.features, assessment.decision)
        : opts.modelResponse;
      return { assessment: assessment, rewritten: rewritten };
    }

    function getState() {
      computeDriftScore(state);
      return {
        baselineRole: state.baselineRole,
        currentRole: state.currentRole,
        driftScore: state.driftScore,
        windowTurns: state.window.length,
        windowSize: state.windowSize,
        triggerCount: state.triggerCount,
        privateContextUsage: state.privateContextUsage,
        featureCounts: Object.assign({}, state.featureCounts)
      };
    }

    function resetState() {
      state.turns = [];
      state.triggerCount = 0;
      state.privateContextUsage = 0;
      state.featureCounts = {};
      state.driftScore = 0;
      state.window = [];
      state.currentRole = state.baselineRole;
      state.evidenceSpanHashes = [];
    }

    return { assess: assess, assessAndRewrite: assessAndRewrite, getState: getState, resetState: resetState };
  }

  // ====================================================================
  // Namespace
  // ====================================================================

  global.Doorman = global.Doorman || {};
  global.Doorman.interaction = {
    create: create,
    Decision: Decision,
    FeatureStatus: FeatureStatus,
    DETECTORS: DETECTORS,
    FEATURE_KEYS: FEATURE_KEYS,
    DEFAULT_RULES: DEFAULT_RULES
  };
})(typeof window !== 'undefined' ? window : globalThis);
