import React from 'react'
import { MathNode, normalizeLatexEquationInput, parseLatexMathAST } from './latexMathUtils'

const SCRIPT_OPERATOR_CHARS = new Set(['=', '+', '−', '<', '>', '|'])

function isOperandPreceding(node: MathNode): 'op' | 'open' | 'punct' | 'space' | 'operand' {
  if (node.type === 'operator' || (node.type === 'symbol' && node.isBinaryOp)) return 'op'
  if (node.type === 'delim' && (node.text === '(' || node.text === '[' || node.text === '{' || node.text === '⟨')) {
    return 'open'
  }
  if (node.type === 'punct' && (node.text === ',' || node.text === ';')) return 'punct'
  if (node.type === 'space') return 'space'
  return 'operand'
}

function renderMathNodeList(
  nodes: MathNode[],
  displayMode: boolean,
  keyPrefix: string
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let prevWasOperand = false

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx]
    out.push(renderMathNode(node, displayMode, prevWasOperand, `${keyPrefix}_${idx}`))
    const kind = isOperandPreceding(node)
    if (kind === 'op' || kind === 'open' || kind === 'punct') {
      prevWasOperand = false
    } else if (kind === 'operand') {
      prevWasOperand = true
    }
  }

  return out
}

function renderMathNode(
  node: MathNode,
  displayMode: boolean,
  prevWasOperand: boolean,
  key: string
): React.ReactNode {
  switch (node.type) {
    case 'group':
      return (
        <React.Fragment key={key}>
          {renderMathNodeList(node.children, displayMode, key)}
        </React.Fragment>
      )

    case 'ident': {
      const isLatin = /^[A-Za-z]$/.test(node.text)
      return (
        <span key={key} className={isLatin ? 'italic' : 'not-italic'}>
          {node.text}
        </span>
      )
    }

    case 'number':
      return (
        <span key={key} className="not-italic tabular-nums">
          {node.text}
        </span>
      )

    case 'delim':
      return (
        <span key={key} className="not-italic px-[0.04em]">
          {node.text}
        </span>
      )

    case 'func':
      return (
        <span
          key={key}
          className={`not-italic font-serif tracking-tight ${
            node.isBigOp && displayMode ? 'text-[1.08em] mx-[0.14em]' : 'mr-[0.14em]'
          }`}
        >
          {node.text}
        </span>
      )

    case 'text': {
      const cls =
        node.variant === 'bold'
          ? 'not-italic font-semibold'
          : node.variant === 'italic'
            ? 'italic'
            : node.variant === 'bb'
              ? 'not-italic font-medium'
              : node.variant === 'cal'
                ? 'italic tracking-wide'
                : 'not-italic font-sans text-[0.9em]'
      return (
        <span key={key} className={cls}>
          {node.text}
        </span>
      )
    }

    case 'space': {
      const w =
        node.size === 'qquad'
          ? 'w-5'
          : node.size === 'quad'
            ? 'w-3'
            : node.size === 'med'
              ? 'w-1.5'
              : 'w-1'
      return <span key={key} className={`inline-block ${w}`} aria-hidden="true" />
    }

    case 'punct': {
      const trailing = node.text === ',' || node.text === ';' ? 'mr-[0.22em]' : ''
      return (
        <span key={key} className={`not-italic ${trailing}`}>
          {node.text}
        </span>
      )
    }

    case 'operator': {
      const isUnarySign = !prevWasOperand && (node.text === '−' || node.text === '+')
      if (isUnarySign) {
        return (
          <span key={key} className="not-italic pr-[0.04em]">
            {node.text}
          </span>
        )
      }
      return (
        <span
          key={key}
          className={`not-italic inline-block ${
            displayMode ? 'mx-[0.26em]' : 'mx-[0.16em]'
          }`}
        >
          {node.text}
        </span>
      )
    }

    case 'symbol': {
      if (node.isBigOp) {
        return (
          <span
            key={key}
            className={`not-italic inline-block leading-none ${
              displayMode ? 'text-[1.28em] mx-[0.08em]' : 'text-[1.08em] mx-[0.04em]'
            }`}
          >
            {node.text}
          </span>
        )
      }
      return (
        <span
          key={key}
          className={`not-italic ${
            node.isBinaryOp ? (displayMode ? 'mx-[0.24em]' : 'mx-[0.14em]') : ''
          }`}
        >
          {node.text}
        </span>
      )
    }

    case 'frac': {
      if (node.isBinom) {
        return (
          <span key={key} className="inline-flex items-center align-middle mx-[0.12em]">
            <span className="not-italic text-[1.15em] font-light mr-[0.06em]">(</span>
            <span className="inline-flex flex-col items-center leading-[1.05] text-[0.78em]">
              <span>{renderMathNode(node.num, false, false, `${key}_n`)}</span>
              <span>{renderMathNode(node.den, false, false, `${key}_d`)}</span>
            </span>
            <span className="not-italic text-[1.15em] font-light ml-[0.06em]">)</span>
          </span>
        )
      }
      return (
        <span
          key={key}
          className={`inline-flex flex-col items-center align-middle leading-[1.08] ${
            displayMode ? 'mx-[0.22em] text-[0.88em]' : 'mx-[0.14em] text-[0.78em]'
          }`}
        >
          <span className="px-[0.28em] pb-[2px] border-b border-current/80 text-center">
            {renderMathNode(node.num, false, false, `${key}_n`)}
          </span>
          <span className="px-[0.28em] pt-[2px] text-center">
            {renderMathNode(node.den, false, false, `${key}_d`)}
          </span>
        </span>
      )
    }

    case 'sqrt':
      return (
        <span key={key} className="inline-flex items-baseline mx-[0.1em]">
          {node.index && (
            <span className="relative -top-[0.42em] text-[0.65em] mr-[0.02em] leading-none">
              {renderMathNode(node.index, false, false, `${key}_idx`)}
            </span>
          )}
          <span className="not-italic select-none">√</span>
          <span className="border-t border-current/80 px-[0.16em] pt-[1px]">
            {renderMathNode(node.radicand, displayMode, false, `${key}_rad`)}
          </span>
        </span>
      )

    case 'accent': {
      if (node.overline) {
        return (
          <span key={key} className="inline-block border-t border-current/85 pt-[1px] leading-tight">
            {renderMathNode(node.base, displayMode, prevWasOperand, `${key}_ab`)}
          </span>
        )
      }
      if (node.underline) {
        return (
          <span key={key} className="inline-block border-b border-current/85 pb-[1px] leading-tight">
            {renderMathNode(node.base, displayMode, prevWasOperand, `${key}_au`)}
          </span>
        )
      }
      return (
        <span key={key} className="inline-flex flex-col items-center leading-none">
          <span>
            {renderMathNode(node.base, displayMode, prevWasOperand, `${key}_ac`)}
            {node.mark}
          </span>
        </span>
      )
    }

    case 'stacked':
      return (
        <span key={key} className="inline-flex flex-col items-center align-middle leading-[1.0] mx-[0.12em]">
          {node.relation === 'over' && (
            <span className="text-[0.68em] mb-[1px]">
              {renderMathNode(node.label, false, false, `${key}_lbl`)}
            </span>
          )}
          <span>{renderMathNode(node.base, displayMode, prevWasOperand, `${key}_sb`)}</span>
          {node.relation === 'under' && (
            <span className="text-[0.68em] mt-[1px]">
              {renderMathNode(node.label, false, false, `${key}_lbl`)}
            </span>
          )}
        </span>
      )

    case 'script': {
      const baseEl = renderMathNode(node.base, displayMode, prevWasOperand, `${key}_b`)
      const subEl = node.sub
        ? renderMathNode(node.sub, false, false, `${key}_sub`)
        : null
      const supEl = node.sup
        ? renderMathNode(node.sup, false, false, `${key}_sup`)
        : null

      const isBigOpUnderOver =
        displayMode &&
        ((node.base.type === 'symbol' && node.base.isBigOp) ||
          (node.base.type === 'func' && node.base.isBigOp))

      if (isBigOpUnderOver && (subEl || supEl)) {
        return (
          <span
            key={key}
            className="inline-flex items-center align-middle mx-[0.1em]"
          >
            <span>{baseEl}</span>
            <span className="inline-flex flex-col items-start justify-center leading-[0.95] text-[0.7em] ml-[0.06em]">
              {supEl && <span className="mb-[2px]">{supEl}</span>}
              {subEl && <span>{subEl}</span>}
            </span>
          </span>
        )
      }

      if (subEl && supEl) {
        return (
          <span key={key} className="inline-flex items-baseline">
            <span>{baseEl}</span>
            <span className="inline-flex flex-col items-start leading-[0.88] text-[0.72em] ml-[0.04em] mr-[0.04em]">
              <span className="-mt-[0.35em]">{supEl}</span>
              <span className="mt-[0.12em]">{subEl}</span>
            </span>
          </span>
        )
      }

      return (
        <span key={key} className="inline-flex items-baseline">
          <span>{baseEl}</span>
          {subEl && (
            <span className="relative -bottom-[0.22em] text-[0.72em] leading-none ml-[0.03em] mr-[0.04em]">
              {subEl}
            </span>
          )}
          {supEl && (
            <span className="relative -top-[0.38em] text-[0.72em] leading-none ml-[0.03em] mr-[0.04em]">
              {supEl}
            </span>
          )}
        </span>
      )
    }

    case 'env': {
      const env = node.envName.replace(/\*$/, '')
      const isCases = env === 'cases'
      const isParens = env === 'pmatrix'
      const isBrackets = env === 'bmatrix'
      const isBraces = env === 'Bmatrix'
      const isBars = env === 'vmatrix'

      const leftDelim = isCases
        ? '{'
        : isParens
          ? '('
          : isBrackets
            ? '['
            : isBraces
              ? '{'
              : isBars
                ? '|'
                : ''
      const rightDelim = isParens
        ? ')'
        : isBrackets
          ? ']'
          : isBraces
            ? '}'
            : isBars
              ? '|'
              : ''

      const grid = (
        <span className="inline-flex flex-col gap-1.5 text-left">
          {node.rows.map((row, rIdx) => (
            <span key={`${key}_r_${rIdx}`} className="inline-flex items-baseline gap-3">
              {row.map((cell, cIdx) => {
                // Skip redundant `&` alignment space cleanly; right-align LHS before `=` in aligned envs
                const alignRight =
                  (env === 'aligned' || env === 'align') && row.length === 2 && cIdx === 0
                return (
                  <span
                    key={`${key}_r_${rIdx}_c_${cIdx}`}
                    className={alignRight ? 'flex-1 text-right' : ''}
                  >
                    {renderMathNodeList(cell, displayMode, `${key}_r_${rIdx}_c_${cIdx}`)}
                  </span>
                )
              })}
            </span>
          ))}
        </span>
      )

      if (!leftDelim && !rightDelim) {
        return (
          <span key={key} className="inline-flex items-center">
            {grid}
          </span>
        )
      }

      return (
        <span key={key} className="inline-flex items-stretch gap-1.5 align-middle">
          {leftDelim && (
            <span className="not-italic font-light text-[1.6em] flex items-center leading-none select-none">
              {leftDelim}
            </span>
          )}
          {grid}
          {rightDelim && (
            <span className="not-italic font-light text-[1.6em] flex items-center leading-none select-none">
              {rightDelim}
            </span>
          )}
        </span>
      )
    }
  }
}

export interface LatexMathProps {
  latex: string
  displayMode?: boolean
  className?: string
}

/**
 * Renders inline (`\( ... \)` / `$ ... $`) or block (`\[ ... \]` / `$$ ... $$`) LaTeX math
 * with pure typographic serif math layout — zero external runtime dependency.
 */
export const LatexMathFormula: React.FC<LatexMathProps> = ({
  latex,
  displayMode = false,
  className = ''
}) => {
  const normalized = normalizeLatexEquationInput(latex)
  if (!normalized) return null

  const hasTopLevelRows =
    displayMode && /\\\\/.test(normalized) && !/\\begin\{/.test(normalized)

  if (!displayMode) {
    const ast = parseLatexMathAST(normalized)
    const isSingleSimpleExpr =
      ast.length === 1 && SCRIPT_OPERATOR_CHARS.has((ast[0] as { text?: string }).text || '')
    return (
      <span
        className={`inline-flex items-baseline font-serif text-[1.03em] leading-none text-[#111111] px-[1.5px] tracking-[0.005em] ${
          isSingleSimpleExpr ? 'not-italic' : ''
        } ${className}`}
        title={normalized}
      >
        {renderMathNodeList(ast, false, 'im')}
      </span>
    )
  }

  const rowNodes = hasTopLevelRows
    ? normalized
        .split(/\\\\/)
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => parseLatexMathAST(r))
    : null

  return (
    <div
      className={`my-3.5 px-5 py-3.5 rounded-2xl bg-[#F8F8FA] border border-black/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-x-auto ${className}`}
    >
      <div
        className="w-fit min-w-full flex flex-col items-center justify-center gap-1.5 font-serif text-[16px] sm:text-[16.5px] leading-[1.65] text-[#111111] tracking-[0.01em]"
        title={normalized}
      >
        {rowNodes ? (
          rowNodes.map((rAst, rIdx) => (
            <div key={`dm_r_${rIdx}`} className="flex items-center justify-center">
              {renderMathNodeList(rAst, true, `dm_${rIdx}`)}
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center">
            {renderMathNodeList(parseLatexMathAST(normalized), true, 'dm')}
          </div>
        )}
      </div>
    </div>
  )
}
