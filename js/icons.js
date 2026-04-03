// js/icons.js — Fine-line SVG chain icons (1px stroke, text-muted color)
// Archival Ledger style: no fill, no color, monochrome sepia line art

const S = 'stroke="#9c8060" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"';

export const CHAIN_ICONS = {
  evm: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2L4 12l8 5 8-5L12 2z" ${S}/><path d="M4 12l8 10 8-10" ${S}/><line x1="12" y1="2" x2="12" y2="22" ${S} stroke-width="0.5" opacity="0.4"/></svg>`,

  bitcoin: `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="5" y="4" width="14" height="16" rx="2" ${S}/><path d="M9 8h4.5a2 2 0 010 4H9zm0 4h5a2 2 0 010 4H9z" ${S}/><line x1="10" y1="3" x2="10" y2="5" ${S}/><line x1="14" y1="3" x2="14" y2="5" ${S}/><line x1="10" y1="19" x2="10" y2="21" ${S}/><line x1="14" y1="19" x2="14" y2="21" ${S}/></svg>`,

  solana: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 17h14l2-2H6L4 17z" ${S}/><path d="M4 12h14l2-2H6L4 12z" ${S}/><path d="M20 7H6L4 9h14l2-2z" ${S}/></svg>`,

  cosmos: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" ${S}/><ellipse cx="12" cy="12" rx="4" ry="9" ${S} transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="4" ry="9" ${S} transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="1.5" fill="#9c8060" opacity="0.5"/></svg>`,

  tron: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 4l16 2-8 16z" ${S}/><line x1="4" y1="4" x2="20" y2="6" ${S}/><line x1="12" y1="22" x2="8" y2="8" ${S} stroke-width="0.6" opacity="0.5"/></svg>`,

  sui: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3C7 3 4 7 4 12s3 9 8 9 8-4 8-9-3-9-8-9z" ${S}/><path d="M9 9c0 2 1.5 3 3 4s3 2 3 4" ${S}/><path d="M15 9c0 2-1.5 3-3 4s-3 2-3 4" ${S}/></svg>`,

  xrpl: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 4l6 7 6-7" ${S}/><path d="M6 20l6-7 6 7" ${S}/></svg>`,

  filecoin: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" ${S}/><line x1="11" y1="5" x2="13" y2="19" ${S}/><line x1="7" y1="9" x2="17" y2="10" ${S} stroke-width="0.8"/><line x1="7" y1="14" x2="17" y2="15" ${S} stroke-width="0.8"/></svg>`,

  spark: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" ${S}/></svg>`,

  ton: `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 8l8-5 8 5" ${S}/><path d="M4 8v10l8 4 8-4V8" ${S}/><line x1="12" y1="3" x2="12" y2="22" ${S} stroke-width="0.6"/></svg>`,
};

export function chainIcon(chain) {
  return CHAIN_ICONS[chain] || CHAIN_ICONS.evm;
}
