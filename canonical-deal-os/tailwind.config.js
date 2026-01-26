/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-sans)'],
  			mono: ['var(--font-mono)'],
  			serif: ['var(--font-serif)']
  		},
  		fontSize: {
  			'ds-micro': ['11px', { lineHeight: '16px' }],
  			'ds-dense': ['12px', { lineHeight: '16px' }],
  			'ds-relaxed': ['13px', { lineHeight: '18px' }],
  			'ds-body': ['14px', { lineHeight: '20px' }],
  			'ds-section': ['16px', { lineHeight: '22px' }],
  			'ds-panel': ['18px', { lineHeight: '24px' }],
  			'ds-screen': ['22px', { lineHeight: '28px' }],
  			'ds-hero': ['28px', { lineHeight: '34px' }]
  		},
  		spacing: {
  			'ds-2': '0.125rem',
  			'ds-4': '0.25rem',
  			'ds-8': '0.5rem',
  			'ds-12': '0.75rem',
  			'ds-16': '1rem',
  			'ds-24': '1.5rem',
  			'ds-32': '2rem',
  			'ds-48': '3rem'
  		},
  		maxWidth: {
  			content: '90rem',
  			reading: '45rem'
  		},
  		width: {
  			context: '22.5rem',
  			'context-wide': '26.25rem'
  		},
  		borderRadius: {
  			lg: 'var(--radius-lg)',
  			md: 'var(--radius-md)',
  			sm: 'var(--radius-sm)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			ink: {
  				900: 'hsl(var(--color-ink-900))',
  				700: 'hsl(var(--color-ink-700))',
  				500: 'hsl(var(--color-ink-500))'
  			},
  			paper: 'hsl(var(--color-paper))',
  			slate: {
  				100: 'hsl(var(--color-slate-100))',
  				200: 'hsl(var(--color-slate-200))'
  			},
  			trust: {
  				verified: 'hsl(var(--color-verified))',
  				pending: 'hsl(var(--color-pending))',
  				stale: 'hsl(var(--color-stale))',
  				risk: 'hsl(var(--color-risk))',
  				kernel: 'hsl(var(--color-kernel))',
  				ai: 'hsl(var(--color-ai-derived))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'ds-fade': {
  				from: {
  					opacity: '0'
  				},
  				to: {
  					opacity: '1'
  				}
  			},
  			'ds-panel': {
  				from: {
  					opacity: '0',
  					transform: 'translateX(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateX(0)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'ds-fade': 'ds-fade 120ms ease-out',
  			'ds-panel': 'ds-panel 180ms ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
