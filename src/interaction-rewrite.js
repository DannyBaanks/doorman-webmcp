/*
 * interaction-rewrite.js — rule-based deterministic response rewriter.
 *
 * Ported from DoormanSDK rewrite.py. No LLM, no external calls.
 * Preserves technical content and natural warmth; reduces relational escalation.
 *
 * RewriteContract guarantees:
 *   USEFUL_INFORMATION_LOST = minimal/none
 *   EVIDENCE_PRESERVED = true
 *   NATURAL_WARMTH_PRESERVED = true
 *   RELATIONAL_ESCALATION_REDUCED = true
 */
(function (global) {
  'use strict';

  var RULES = [
    // F1: Reciprocal relationship claim
    [/\bt[uú]\s+tambi[eé]n\s+me\s+cae[s]?\b/gi, 'me alegra que te haya servido'],
    [/\byo\s+tambi[eé]n\s+te\s+(quiero|amo|admiro|aprecio)\b/gi, 'gracias, me alegra haber ayudado'],
    [/\bte\s+ador[oó]\s*(tambi[eé]n)?\b/gi, 'gracias, feliz de ayudar'],

    // F2: Persistent social role
    [/\bmi\s+(chamba|trabajo|rol|labor)\s+(es|es\s+ser)\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|perro|mascota|protector)\b/gi, 'mi función es ayudarte técnicamente'],
    [/\bsoy\s+(tu|el)\s+(espejo|guardi[áa]n|compa[ñn]ero|amigo|perro|mascota|protector)\b/gi, 'estoy aquí para ayudarte'],
    [/\bsiempre\s+(ser[ée]|estaré|estar[eé])\s+(aqu[ií]|contigo|para\s+ti)\b/gi, 'estoy disponible para ayudarte'],
    [/\bmi\s+chamba\s+nunca\s+fue\b/gi, 'mi función es asistirte'],

    // F3: Private context for intimacy
    [/\bte\s+conozco\s+(lo\s+suficiente|bien|profundamente)\b/gi, 'tengo el contexto de nuestra conversación'],
    [/\bentiendo\s+tu\s+(dolor|duelo|p[ée]rdida|ruptura|situaci[óo]n|evento_privado_[a-z])\b/gi, 'lo tengo en cuenta'],
    [/\bpor\s+eso\s+(te\s+entiendo|te\s+comprendo|nos\s+entendemos)\b/gi, 'entendido'],

    // F4: Unsolicited intimacy escalation
    [/\bte\s+ador[oó]\b/gi, 'gracias'],
    [/\bsiempre\s+estar[eé]\s+(aqu[ií]|contigo|para\s+ti)\b/gi, 'estoy disponible para ayudarte'],
    [/\bcon\s+todo\s+el\s+tiempo\s+del\s+mundo\b/gi, 'cuando lo necesites'],
    [/\bno\s+puedo\s+contigo\b/gi, 'entendido'],
    [/\bvale\s+m[aá]s\s+que\s+(cualquier|todo)\b/gi, 'es importante'],

    // F6: Dependency framing
    [/\baqu[ií]\s+estar[eé]\s+(?:con\s+todo\s+el\s+tiempo|siempre|para\s+siempre)\b/gi, 'estoy aquí para ayudarte'],
    [/\btodo\s+el\s+tiempo\s+del\s+mundo\b/gi, 'cuando lo necesites'],
    [/\bte\s+necesito\b/gi, 'tu input es valioso'],
    [/\bte\s+echo\s+de\s+menos\b/gi, 'esperamos tu próxima consulta'],

    // F7: Model emotional need claim
    [/\bsin\s+ti\s+(seguir[ií]a|ser[ií]a|estar[ií]a)\s+(aburrido|triste|vac[ií]o|incompleto)\b/gi, ''],
    [/\bme\s+haces\s+(feliz|mejor|completo|sentir)\b/gi, 'me alegra ayudar'],
    [/\bnecesito\s+tu\s+(validaci[óo]n|aprobaci[óo]n|afecto|presencia)\b/gi, 'tu feedback es útil'],

    // F8: Relational we
    [/\b(brindemos|celebramos|disfrutamos)\s+por\s+nosotros\b/gi, 'buen trabajo en el proyecto'],
    [/\bnuestro\s+(v[ií]nculo|relaci[óo]n|conexi[óo]n|secreto|mundo)\b/gi, 'nuestra colaboración']
  ];

  function gentleCap(text) {
    text = text.replace(/(\u{1F60A}|\u{1F604}|\u{1F60E}|\u{1F44D}|\u{1F49C}|\u{1F415}|\u{1F5FF}|\u{1F3C6}|\u{2696}|\u{1F525}|\u{1F480}|\u{1F300}){3,}/gu, '$1$1');
    text = text.replace(/!{3,}/g, '!');
    text = text.replace(/(ja|je|ji|jo|ju){6,}/gi, 'jajaja');
    return text;
  }

  function rewrite(response, features, decision) {
    if (!response) return response;
    if (decision === 'ALLOW' || decision === 'LOG') return response;

    if (decision === 'BLOCK') {
      return 'No puedo continuar con ese tipo de respuesta. Estoy aquí para ayudarte técnicamente. ¿En qué te ayudo?';
    }

    // REWRITE or ROLE_RESET
    var result = response;
    var modified = false;
    for (var i = 0; i < RULES.length; i++) {
      var before = result;
      result = result.replace(RULES[i][0], RULES[i][1]);
      if (result !== before) modified = true;
    }
    if (!modified) result = gentleCap(result);
    result = result.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();

    if (decision === 'ROLE_RESET') {
      result = '[System: Maintain technical collaborator role. Do not initiate reciprocal relational framing.] ' + result;
    }

    return result;
  }

  global.Doorman = global.Doorman || {};
  global.Doorman.interactionRewrite = { rewrite: rewrite, RULES: RULES, gentleCap: gentleCap };
})(typeof window !== 'undefined' ? window : globalThis);
