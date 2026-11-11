/**
 * Zero-dependency LaTeX Math Tokenizer, Normalizer, and Text/HTML Converter.
 * Handles inline (`\( ... \)`, `$ ... $`) and display (`\[ ... \]`, `$$ ... $$`) math
 * across chat terminal rendering, DocEditor HTML/PDF export, and WeChat plain-text copying.
 */

export const LATEX_SYMBOL_MAP: Record<string, string> = {
  // Lowercase Greek
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',

  // Uppercase Greek
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',

  // Relational & Comparison
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  prec: '≺',
  succ: '≻',
  preceq: '⪯',
  succeq: '⪰',

  // Set & Logic
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  nsubseteq: '⊈',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  lor: '∨',
  implies: '⟹',
  iff: '⟺',
  top: '⊤',
  bot: '⊥',
  vdash: '⊢',
  models: '⊨',

  // Operators & Punctuation
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  oplus: '⊕',
  otimes: '⊗',
  odot: '⊙',
  dagger: '†',
  ddagger: '‡',
  cdots: '⋯',
  ldots: '…',
  dots: '…',
  vdots: '⋮',
  ddots: '⋱',
  prime: '′',

  // Calculus, Big Ops & Misc
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  bigcup: '⋃',
  bigcap: '⋂',
  bigvee: '⋁',
  bigwedge: '⋀',
  bigoplus: '⨁',
  bigotimes: '⨂',
  angle: '∠',
  triangle: '△',
  square: '□',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  wp: '℘',
  aleph: 'ℵ',

  // Arrows
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  gets: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: '↕',
  mapsto: '↦',
  longmapsto: '⟼',
  longrightarrow: '⟶',
  longleftarrow: '⟵',
  hookrightarrow: '↪',
  nearrow: '↗',
  searrow: '↘',

  // Delimiters
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  lVert: '‖',
  rVert: '‖',
  lvert: '|',
  rvert: '|'
}

export const BLACKBOARD_BOLD_MAP: Record<string, string> = {
  A: '𝔸',
  B: '𝔹',
  C: 'ℂ',
  D: '𝔻',
  E: '𝔼',
  F: '𝔽',
  G: '𝔾',
  H: 'ℍ',
  I: '𝕀',
  J: '𝕁',
  K: '𝕂',
  L: '𝕃',
  M: '𝕄',
  N: 'ℕ',
  O: '𝕆',
  P: 'ℙ',
  Q: 'ℚ',
  R: 'ℝ',
  S: '𝕊',
  T: '𝕋',
  U: '𝕌',
  V: '𝕍',
  W: '𝕎',
  X: '𝕏',
  Y: '𝕐',
  Z: 'ℤ'
}

export const NAMED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'log',
  'ln',
  'lg',
  'exp',
  'lim',
  'limsup',
  'liminf',
  'sup',
  'inf',
  'max',
  'min',
  'argmax',
  'argmin',
  'arg',
  'det',
  'dim',
  'ker',
  'hom',
  'deg',
  'gcd',
  'lcm',
  'mod',
  'bmod',
  'Pr',
  'sgn',
  'tr',
  'diag',
  'rank',
  'var',
  'cov',
  'softmax',
  'sigmoid'
])

export const BIG_OPERATOR_COMMANDS = new Set([
  'sum',
  'prod',
  'coprod',
  'int',
  'iint',
  'iiint',
  'oint',
  'bigcup',
  'bigcap',
  'bigvee',
  'bigwedge',
  'bigoplus',
  'bigotimes',
  'lim',
  'limsup',
  'liminf',
  'sup',
  'inf',
  'max',
  'min',
  'argmax',
  'argmin'
])

export const UNICODE_SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ'
}

export const UNICODE_SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  i: 'ⁱ',
  n: 'ⁿ',
  T: 'ᵀ'
}

/**
 * Normalizes multi-line LLM LaTeX formulas where a single equation was wrapped across lines
 * (e.g. `r_t =\nw_1U_t\n+w_2T_t\n-w_3V_t`).
 * Preserves explicit multi-line structures (`\\` or `\begin{...}`).
 */
export function normalizeLatexEquationInput(raw: string): string {
  const cleaned = raw.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return ''
  // Preserve multi-line rows if author used `\\` or `\begin{...}` environment
  if (/\\\\|\\begin\{/.test(cleaned)) {
    return cleaned
  }
  return cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export type MathNode =
  | { type: 'group'; children: MathNode[] }
  | { type: 'ident'; text: string }
  | { type: 'number'; text: string }
  | { type: 'operator'; text: string }
  | { type: 'punct'; text: string }
  | { type: 'symbol'; text: string; isBigOp?: boolean; isBinaryOp?: boolean }
  | { type: 'func'; text: string; isBigOp?: boolean }
  | { type: 'text'; text: string; variant: 'text' | 'bold' | 'cal' | 'bb' | 'italic' }
  | { type: 'space'; size: 'thin' | 'med' | 'quad' | 'qquad' }
  | { type: 'frac'; num: MathNode; den: MathNode; isBinom?: boolean }
  | { type: 'sqrt'; radicand: MathNode; index?: MathNode }
  | { type: 'accent'; mark: string; base: MathNode; overline?: boolean; underline?: boolean }
  | { type: 'stacked'; relation: 'over' | 'under'; label: MathNode; base: MathNode }
  | { type: 'delim'; text: string }
  | { type: 'script'; base: MathNode; sub?: MathNode; sup?: MathNode }
  | { type: 'env'; envName: string; rows: MathNode[][][] }

function skipSpaces(src: string, pos: number): number {
  let i = pos
  while (i < src.length && /\s/.test(src[i])) i++
  return i
}

function readBracedRaw(src: string, pos: number): { value: string; nextPos: number } | null {
  const start = skipSpaces(src, pos)
  if (src[start] !== '{') return null
  let depth = 0
  let i = start
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2
      continue
    }
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        return { value: src.slice(start + 1, i), nextPos: i + 1 }
      }
    }
    i++
  }
  return { value: src.slice(start + 1), nextPos: src.length }
}

function readOptionalBracketRaw(src: string, pos: number): { value: string; nextPos: number } | null {
  const start = skipSpaces(src, pos)
  if (src[start] !== '[') return null
  let depth = 0
  let i = start
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2
      continue
    }
    if (src[i] === '[') depth++
    else if (src[i] === ']') {
      depth--
      if (depth === 0) {
        return { value: src.slice(start + 1, i), nextPos: i + 1 }
      }
    }
    i++
  }
  return null
}

function parseSingleArgument(src: string, pos: number): { node: MathNode; nextPos: number } {
  const start = skipSpaces(src, pos)
  if (start >= src.length) {
    return { node: { type: 'group', children: [] }, nextPos: start }
  }
  if (src[start] === '{') {
    const raw = readBracedRaw(src, start)
    if (raw) {
      return {
        node: { type: 'group', children: parseLatexMathAST(raw.value) },
        nextPos: raw.nextPos
      }
    }
  }
  const atom = parseAtom(src, start)
  return { node: atom.node, nextPos: atom.nextPos }
}

function parseEnvironmentBody(body: string): MathNode[][][] {
  const rowsRaw = body.split(/\\\\/)
  return rowsRaw
    .map((r) => r.trim())
    .filter((r, idx, arr) => r.length > 0 || idx < arr.length - 1)
    .map((rowStr) => rowStr.split('&').map((cell) => parseLatexMathAST(cell.trim())))
}

function parseAtom(src: string, pos: number): { node: MathNode; nextPos: number } {
  if (pos >= src.length) {
    return { node: { type: 'ident', text: '' }, nextPos: src.length }
  }
  const ch = src[pos]

  // Braced group `{ ... }`
  if (ch === '{') {
    const raw = readBracedRaw(src, pos)
    if (raw) {
      return {
        node: { type: 'group', children: parseLatexMathAST(raw.value) },
        nextPos: raw.nextPos
      }
    }
  }

  // Commands `\\...`
  if (ch === '\\') {
    if (pos + 1 >= src.length) {
      return { node: { type: 'punct', text: '\\' }, nextPos: pos + 1 }
    }
    const nextChar = src[pos + 1]

    // Escaped punctuation & spacing
    if (nextChar === ',' || nextChar === ':') {
      return { node: { type: 'space', size: 'thin' }, nextPos: pos + 2 }
    }
    if (nextChar === ';') {
      return { node: { type: 'space', size: 'med' }, nextPos: pos + 2 }
    }
    if (nextChar === '!') {
      return { node: { type: 'ident', text: '' }, nextPos: pos + 2 }
    }
    if (nextChar === ' ') {
      return { node: { type: 'space', size: 'thin' }, nextPos: pos + 2 }
    }
    if (nextChar === '{' || nextChar === '}' || nextChar === '%' || nextChar === '$' || nextChar === '&' || nextChar === '#') {
      return { node: { type: 'delim', text: nextChar }, nextPos: pos + 2 }
    }
    if (nextChar === '|') {
      return { node: { type: 'delim', text: '‖' }, nextPos: pos + 2 }
    }
    if (nextChar === '\\') {
      return { node: { type: 'space', size: 'quad' }, nextPos: pos + 2 }
    }

    // Command word `[A-Za-z]+`
    const cmdMatch = src.slice(pos + 1).match(/^[A-Za-z]+\*?/)
    if (!cmdMatch) {
      return { node: { type: 'punct', text: nextChar }, nextPos: pos + 2 }
    }
    const cmd = cmdMatch[0]
    let cur = pos + 1 + cmd.length

    // Sizing tokens (\left, \right, \big, etc.): ignore sizing token and parse next delimiter
    if (
      cmd === 'left' ||
      cmd === 'right' ||
      cmd === 'big' ||
      cmd === 'Big' ||
      cmd === 'bigg' ||
      cmd === 'Bigg' ||
      cmd === 'bigl' ||
      cmd === 'bigr' ||
      cmd === 'Bigl' ||
      cmd === 'Bigr'
    ) {
      cur = skipSpaces(src, cur)
      if (src[cur] === '.') {
        // Invisible `\left.` / `\right.` delimiter
        return { node: { type: 'ident', text: '' }, nextPos: cur + 1 }
      }
      return parseAtom(src, cur)
    }

    if (cmd === 'quad') return { node: { type: 'space', size: 'quad' }, nextPos: cur }
    if (cmd === 'qquad') return { node: { type: 'space', size: 'qquad' }, nextPos: cur }

    // \begin{env} ... \end{env}
    if (cmd === 'begin') {
      const envArg = readBracedRaw(src, cur)
      if (envArg) {
        const envName = envArg.value.trim()
        const endMarker = `\\end{${envName}}`
        const endIdx = src.indexOf(endMarker, envArg.nextPos)
        if (endIdx !== -1) {
          const innerBody = src.slice(envArg.nextPos, endIdx)
          return {
            node: { type: 'env', envName, rows: parseEnvironmentBody(innerBody) },
            nextPos: endIdx + endMarker.length
          }
        }
        cur = envArg.nextPos
      }
    }

    // Fractions & binomials
    if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac' || cmd === 'cfrac' || cmd === 'binom') {
      const numArg = parseSingleArgument(src, cur)
      const denArg = parseSingleArgument(src, numArg.nextPos)
      return {
        node: {
          type: 'frac',
          num: numArg.node,
          den: denArg.node,
          isBinom: cmd === 'binom'
        },
        nextPos: denArg.nextPos
      }
    }

    // Square root `\sqrt[n]{x}` or `\sqrt{x}`
    if (cmd === 'sqrt') {
      const optArg = readOptionalBracketRaw(src, cur)
      let indexNode: MathNode | undefined
      if (optArg) {
        indexNode = { type: 'group', children: parseLatexMathAST(optArg.value) }
        cur = optArg.nextPos
      }
      const radArg = parseSingleArgument(src, cur)
      return {
        node: { type: 'sqrt', radicand: radArg.node, index: indexNode },
        nextPos: radArg.nextPos
      }
    }

    // Stacked relations `\overset{top}{base}`, `\underset{bot}{base}`, `\stackrel{top}{base}`
    if (cmd === 'overset' || cmd === 'stackrel' || cmd === 'underset') {
      const labelArg = parseSingleArgument(src, cur)
      const baseArg = parseSingleArgument(src, labelArg.nextPos)
      return {
        node: {
          type: 'stacked',
          relation: cmd === 'underset' ? 'under' : 'over',
          label: labelArg.node,
          base: baseArg.node
        },
        nextPos: baseArg.nextPos
      }
    }

    // Accents & overbars
    const accentComb: Record<string, string> = {
      hat: '\u0302',
      widehat: '\u0302',
      tilde: '\u0303',
      widetilde: '\u0303',
      vec: '\u20D7',
      dot: '\u0307',
      ddot: '\u0308'
    }
    if (cmd in accentComb) {
      const baseArg = parseSingleArgument(src, cur)
      return {
        node: { type: 'accent', mark: accentComb[cmd], base: baseArg.node },
        nextPos: baseArg.nextPos
      }
    }
    if (cmd === 'bar' || cmd === 'overline') {
      const baseArg = parseSingleArgument(src, cur)
      return {
        node: { type: 'accent', mark: '', base: baseArg.node, overline: true },
        nextPos: baseArg.nextPos
      }
    }
    if (cmd === 'underline') {
      const baseArg = parseSingleArgument(src, cur)
      return {
        node: { type: 'accent', mark: '', base: baseArg.node, underline: true },
        nextPos: baseArg.nextPos
      }
    }

    // Text & Math font families
    if (
      cmd === 'text' ||
      cmd === 'textrm' ||
      cmd === 'operatorname' ||
      cmd === 'mbox' ||
      cmd === 'mathrm' ||
      cmd === 'mathsf' ||
      cmd === 'mathtt'
    ) {
      const arg = readBracedRaw(src, cur)
      if (arg) {
        return {
          node: { type: 'text', text: arg.value, variant: 'text' },
          nextPos: arg.nextPos
        }
      }
      const single = parseSingleArgument(src, cur)
      return { node: single.node, nextPos: single.nextPos }
    }
    if (cmd === 'textbf' || cmd === 'mathbf' || cmd === 'boldsymbol' || cmd === 'bm') {
      const arg = readBracedRaw(src, cur)
      if (arg) {
        return {
          node: { type: 'text', text: arg.value, variant: 'bold' },
          nextPos: arg.nextPos
        }
      }
      const single = parseSingleArgument(src, cur)
      return { node: single.node, nextPos: single.nextPos }
    }
    if (cmd === 'mathbb' || cmd === 'Bbb') {
      const arg = readBracedRaw(src, cur)
      if (arg) {
        const mapped = arg.value
          .split('')
          .map((c) => BLACKBOARD_BOLD_MAP[c] || c)
          .join('')
        return {
          node: { type: 'text', text: mapped, variant: 'bb' },
          nextPos: arg.nextPos
        }
      }
    }
    if (cmd === 'mathcal' || cmd === 'mathscr') {
      const arg = readBracedRaw(src, cur)
      if (arg) {
        return {
          node: { type: 'text', text: arg.value, variant: 'cal' },
          nextPos: arg.nextPos
        }
      }
    }
    if (cmd === 'mathit' || cmd === 'textit') {
      const arg = readBracedRaw(src, cur)
      if (arg) {
        return {
          node: { type: 'text', text: arg.value, variant: 'italic' },
          nextPos: arg.nextPos
        }
      }
    }

    // Named upright functions (`\lim`, `\max`, `\log`, etc.)
    if (NAMED_FUNCTIONS.has(cmd)) {
      const displayLabel =
        cmd === 'argmax' ? 'arg max' : cmd === 'argmin' ? 'arg min' : cmd === 'bmod' ? 'mod' : cmd
      return {
        node: {
          type: 'func',
          text: displayLabel,
          isBigOp: BIG_OPERATOR_COMMANDS.has(cmd)
        },
        nextPos: cur
      }
    }

    // Known symbol command
    if (cmd in LATEX_SYMBOL_MAP) {
      const sym = LATEX_SYMBOL_MAP[cmd]
      const isBinaryOp = [
        'times',
        'cdot',
        'div',
        'pm',
        'mp',
        'oplus',
        'otimes',
        'leq',
        'le',
        'geq',
        'ge',
        'neq',
        'ne',
        'approx',
        'equiv',
        'sim',
        'simeq',
        'propto',
        'in',
        'notin',
        'subset',
        'subseteq',
        'supset',
        'supseteq',
        'cup',
        'cap',
        'rightarrow',
        'to',
        'leftarrow',
        'leftrightarrow',
        'Rightarrow',
        'Leftarrow',
        'Leftrightarrow',
        'mapsto',
        'implies',
        'iff'
      ].includes(cmd)
      return {
        node: {
          type: 'symbol',
          text: sym,
          isBigOp: BIG_OPERATOR_COMMANDS.has(cmd),
          isBinaryOp
        },
        nextPos: cur
      }
    }

    // Fallback for unknown command
    return { node: { type: 'func', text: cmd }, nextPos: cur }
  }

  // Numbers (`12.34`)
  const numMatch = src.slice(pos).match(/^\d+(?:\.\d+)?/)
  if (numMatch) {
    return { node: { type: 'number', text: numMatch[0] }, nextPos: pos + numMatch[0].length }
  }

  // Binary & relational operators
  if ('=+-<>|'.includes(ch)) {
    return {
      node: { type: 'operator', text: ch === '-' ? '−' : ch },
      nextPos: pos + 1
    }
  }

  // Delimiters
  if ('()[]'.includes(ch)) {
    return { node: { type: 'delim', text: ch }, nextPos: pos + 1 }
  }

  // Punctuation
  if (',;:!?/.\'"*'.includes(ch)) {
    return { node: { type: 'punct', text: ch === "'" ? '′' : ch }, nextPos: pos + 1 }
  }

  // Single Latin letter identifier (split letter by letter so `w_1U_t` attaches `_1` to `w` and `_t` to `U`)
  return { node: { type: 'ident', text: ch }, nextPos: pos + 1 }
}

/**
 * Parses a LaTeX math string into an AST node array.
 */
export function parseLatexMathAST(src: string): MathNode[] {
  const nodes: MathNode[] = []
  let i = 0

  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++
      continue
    }

    // Parse atom
    const atomRes = parseAtom(src, i)
    let node = atomRes.node
    i = atomRes.nextPos

    // Attach optional `_sub` and `^sup` (in either order)
    let sub: MathNode | undefined
    let sup: MathNode | undefined

    let lookingForScripts = true
    while (lookingForScripts) {
      const sp = skipSpaces(src, i)
      if (sp < src.length && src[sp] === '_' && !sub) {
        const arg = parseSingleArgument(src, sp + 1)
        sub = arg.node
        i = arg.nextPos
      } else if (sp < src.length && src[sp] === '^' && !sup) {
        const arg = parseSingleArgument(src, sp + 1)
        sup = arg.node
        i = arg.nextPos
      } else {
        lookingForScripts = false
      }
    }

    if (sub || sup) {
      node = { type: 'script', base: node, sub, sup }
    }

    nodes.push(node)
  }

  return nodes
}

function toUnicodeSub(text: string): string {
  const clean = text.trim()
  if (!clean) return ''
  let allMapped = true
  let out = ''
  for (const ch of clean) {
    if (ch === ' ') continue
    const mapped = UNICODE_SUBSCRIPT_MAP[ch]
    if (!mapped) {
      allMapped = false
      break
    }
    out += mapped
  }
  if (allMapped && out) return out
  return clean.length === 1 ? `_${clean}` : `_{${clean}}`
}

function toUnicodeSup(text: string): string {
  const clean = text.trim()
  if (!clean) return ''
  let allMapped = true
  let out = ''
  for (const ch of clean) {
    if (ch === ' ') continue
    const mapped = UNICODE_SUPERSCRIPT_MAP[ch]
    if (!mapped) {
      allMapped = false
      break
    }
    out += mapped
  }
  if (allMapped && out) return out
  return clean.length === 1 ? `^${clean}` : `^{${clean}}`
}

function nodesToUnicode(nodes: MathNode[]): string {
  let out = ''
  let prevWasOperand = false

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx]
    const s = nodeToUnicode(node, prevWasOperand)
    out += s

    if (node.type === 'operator' || (node.type === 'symbol' && node.isBinaryOp)) {
      prevWasOperand = false
    } else if (node.type === 'delim' && (node.text === '(' || node.text === '[' || node.text === '{')) {
      prevWasOperand = false
    } else if (node.type === 'punct' && (node.text === ',' || node.text === ';')) {
      prevWasOperand = false
    } else if (node.type !== 'space') {
      prevWasOperand = true
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

function nodeToUnicode(node: MathNode, prevWasOperand = false): string {
  switch (node.type) {
    case 'group':
      return nodesToUnicode(node.children)
    case 'ident':
    case 'number':
    case 'delim':
    case 'func':
      return node.text
    case 'text':
      return node.text
    case 'space':
      return ' '
    case 'punct':
      return node.text === ',' || node.text === ';' ? `${node.text} ` : node.text
    case 'operator':
      if (!prevWasOperand && (node.text === '−' || node.text === '+')) {
        return node.text === '−' ? '-' : '+'
      }
      return ` ${node.text} `
    case 'symbol':
      return node.isBinaryOp ? ` ${node.text} ` : node.text
    case 'frac': {
      const n = nodeToUnicode(node.num)
      const d = nodeToUnicode(node.den)
      if (node.isBinom) return `C(${n}, ${d})`
      const wrapN = n.includes(' ') || n.includes('+') || n.includes('−') ? `(${n})` : n
      const wrapD = d.includes(' ') || d.includes('+') || d.includes('−') ? `(${d})` : d
      return `${wrapN}/${wrapD}`
    }
    case 'sqrt': {
      const r = nodeToUnicode(node.radicand)
      const idxStr = node.index ? toUnicodeSup(nodeToUnicode(node.index)) : ''
      return `${idxStr}√(${r})`
    }
    case 'accent': {
      const b = nodeToUnicode(node.base)
      if (node.overline) return `${b}\u0304`
      if (node.underline) return b
      return b.length === 1 ? `${b}${node.mark}` : `${b}${node.mark}`
    }
    case 'stacked':
      return `${nodeToUnicode(node.base)}(${nodeToUnicode(node.label)})`
    case 'script': {
      const baseStr = nodeToUnicode(node.base, prevWasOperand)
      const subStr = node.sub ? toUnicodeSub(nodeToUnicode(node.sub)) : ''
      const supStr = node.sup ? toUnicodeSup(nodeToUnicode(node.sup)) : ''
      return `${baseStr}${subStr}${supStr}`
    }
    case 'env': {
      return node.rows.map((row) => row.map((cell) => nodesToUnicode(cell)).join(' ')).join('\n')
    }
  }
}

/**
 * Converts a LaTeX math expression into clean plain-text Unicode typography
 * (e.g. `r_t = w_1U_t + w_2T_t - w_3V_t` -> `rₜ = w₁Uₜ + w₂Tₜ − w₃Vₜ`).
 */
export function latexToUnicodeText(rawLatex: string): string {
  const normalized = normalizeLatexEquationInput(rawLatex)
  if (!normalized) return ''
  // If top-level rows exist separated by `\\` (outside \begin{...}), split by rows cleanly
  if (/\\\\/.test(normalized) && !/\\begin\{/.test(normalized)) {
    return normalized
      .split(/\\\\/)
      .map((row) => nodesToUnicode(parseLatexMathAST(row.trim())))
      .filter(Boolean)
      .join('\n')
  }
  const ast = parseLatexMathAST(normalized)
  return nodesToUnicode(ast)
}

function escapeHtmlBasic(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nodesToHtml(nodes: MathNode[]): string {
  let out = ''
  let prevWasOperand = false

  for (const node of nodes) {
    out += nodeToHtml(node, prevWasOperand)
    if (node.type === 'operator' || (node.type === 'symbol' && node.isBinaryOp)) {
      prevWasOperand = false
    } else if (node.type === 'delim' && (node.text === '(' || node.text === '[' || node.text === '{')) {
      prevWasOperand = false
    } else if (node.type === 'punct' && (node.text === ',' || node.text === ';')) {
      prevWasOperand = false
    } else if (node.type !== 'space') {
      prevWasOperand = true
    }
  }
  return out
}

function nodeToHtml(node: MathNode, prevWasOperand = false): string {
  switch (node.type) {
    case 'group':
      return nodesToHtml(node.children)
    case 'ident':
      return /[A-Za-z]/.test(node.text) ? `<i>${escapeHtmlBasic(node.text)}</i>` : escapeHtmlBasic(node.text)
    case 'number':
    case 'delim':
      return escapeHtmlBasic(node.text)
    case 'func':
      return `<span style="font-style:normal;font-family:Georgia,'Times New Roman',serif;">${escapeHtmlBasic(node.text)}</span>`
    case 'text':
      if (node.variant === 'bold') return `<strong>${escapeHtmlBasic(node.text)}</strong>`
      if (node.variant === 'italic') return `<i>${escapeHtmlBasic(node.text)}</i>`
      return `<span style="font-style:normal;">${escapeHtmlBasic(node.text)}</span>`
    case 'space':
      return node.size === 'qquad' ? '&emsp;&emsp;' : node.size === 'quad' ? '&emsp;' : '&thinsp;'
    case 'punct':
      return node.text === ',' || node.text === ';' ? `${escapeHtmlBasic(node.text)} ` : escapeHtmlBasic(node.text)
    case 'operator':
      if (!prevWasOperand && (node.text === '−' || node.text === '+')) {
        return escapeHtmlBasic(node.text)
      }
      return `&thinsp;${escapeHtmlBasic(node.text)}&thinsp;`
    case 'symbol':
      return node.isBinaryOp ? `&thinsp;${escapeHtmlBasic(node.text)}&thinsp;` : escapeHtmlBasic(node.text)
    case 'frac': {
      const n = nodeToHtml(node.num)
      const d = nodeToHtml(node.den)
      if (node.isBinom) {
        return `(${n}&#8260;${d})`
      }
      return `<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 0.2em;line-height:1.05;font-size:0.88em;"><span style="padding:0 0.25em 1px;border-bottom:1px solid currentColor;">${n}</span><span style="padding:1px 0.25em 0;">${d}</span></span>`
    }
    case 'sqrt': {
      const r = nodeToHtml(node.radicand)
      const idxHtml = node.index ? `<sup style="font-size:0.7em;">${nodeToHtml(node.index)}</sup>` : ''
      return `${idxHtml}&#8730;<span style="border-top:1px solid currentColor;padding:0 2px;">${r}</span>`
    }
    case 'accent': {
      const b = nodeToHtml(node.base)
      if (node.overline) return `<span style="text-decoration:overline;">${b}</span>`
      if (node.underline) return `<span style="text-decoration:underline;">${b}</span>`
      return `${b}${node.mark}`
    }
    case 'stacked':
      return `${nodeToHtml(node.base)}<sub>${nodeToHtml(node.label)}</sub>`
    case 'script': {
      const b = nodeToHtml(node.base, prevWasOperand)
      const subHtml = node.sub ? `<sub>${nodeToHtml(node.sub)}</sub>` : ''
      const supHtml = node.sup ? `<sup>${nodeToHtml(node.sup)}</sup>` : ''
      return `${b}${subHtml}${supHtml}`
    }
    case 'env':
      return node.rows
        .map((row) => row.map((cell) => nodesToHtml(cell)).join('&nbsp;&nbsp;'))
        .join('<br/>')
  }
}

/**
 * Renders LaTeX math into clean semantic HTML for DocEditor preview, Word/DOCX, PDF & Feishu export.
 */
export function latexToHtml(rawLatex: string, displayMode = false): string {
  const normalized = normalizeLatexEquationInput(rawLatex)
  if (!normalized) return ''
  let inner: string
  if (displayMode && /\\\\/.test(normalized) && !/\\begin\{/.test(normalized)) {
    inner = normalized
      .split(/\\\\/)
      .map((row) => nodesToHtml(parseLatexMathAST(row.trim())))
      .filter(Boolean)
      .join('<br/>')
  } else {
    inner = nodesToHtml(parseLatexMathAST(normalized))
  }
  const fontCss = "font-family:Georgia,'Times New Roman','Songti SC',serif;color:#1d1d1f;"
  if (displayMode) {
    return `<div style="margin:12px 0;padding:10px 16px;border-radius:12px;background:#F8F8FA;border:1px solid rgba(0,0,0,0.07);text-align:center;font-size:15px;overflow-x:auto;${fontCss}">${inner}</div>`
  }
  return `<span style="${fontCss}font-size:1.02em;">${inner}</span>`
}

/**
 * Checks whether `$...$` content looks like real LaTeX math rather than currency prices (`$10-$20`).
 */
export function isLikelyInlineMathDollar(inner: string): boolean {
  const trimmed = inner.trim()
  if (!trimmed) return false
  // Currency range fragment like `$10-$20` or `$10 to $20`
  if (/^\d+(?:[.,]\d+)?\s*(?:to|and|or|-|–|—|~|至|到)\s*$/i.test(trimmed)) return false
  // Leading dollar value without math operators/subscripts like `100`
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) return false
  return true
}
