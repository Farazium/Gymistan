import { useQuery } from '@tanstack/react-query'
import api from '../api/axios'

// The gym's own prepaid balance. Every WhatsApp send invalidates ['wa-billing'],
// so anything reading this re-renders as credits are spent. Returns null until
// loaded — callers should treat that as "don't block yet".
export function useWaCredits(enabled = true) {
  const { data } = useQuery({
    queryKey: ['wa-billing'],
    queryFn: async () => { const { data } = await api.get('/gyms/whatsapp-billing/'); return data },
    enabled,
  })
  return data?.credits || null
}

// Shared styling for the prepaid WhatsApp message balance. `alert_level` comes
// straight from the API (apps/gyms/credits.py) so the escalation thresholds live
// in one place on the backend: 80% low, 90% high, 95% critical, then exhausted.
export const CREDIT_TONES = {
  ok: {
    bg: 'bg-primary-500/10', border: 'border-primary-400/25',
    text: 'text-primary-300', bar: 'bg-primary-500',
  },
  low: {
    bg: 'bg-yellow-500/10', border: 'border-yellow-400/30',
    text: 'text-yellow-300', bar: 'bg-yellow-500',
  },
  high: {
    bg: 'bg-orange-500/10', border: 'border-orange-400/30',
    text: 'text-orange-300', bar: 'bg-orange-500',
  },
  critical: {
    bg: 'bg-red-500/10', border: 'border-red-400/30',
    text: 'text-red-300', bar: 'bg-red-500',
  },
  exhausted: {
    bg: 'bg-red-500/15', border: 'border-red-400/40',
    text: 'text-red-300', bar: 'bg-red-500',
  },
}

// Headline shown on the dashboard banner for each level.
export const CREDIT_MESSAGES = {
  low: (c) => `${c.remaining} WhatsApp messages left of ${c.allowance}`,
  high: (c) => `Only ${c.remaining} WhatsApp messages left`,
  critical: (c) => `Almost out — ${c.remaining} WhatsApp messages left`,
  exhausted: () => 'WhatsApp messaging is paused',
}

export const CREDIT_HINTS = {
  low: () => 'Contact Gymistan to top up when convenient.',
  high: () => 'Top up soon to avoid interruption.',
  critical: () => 'Top up now — receipts and reminders stop when this hits zero.',
  exhausted: () => 'Your message pack is finished. Contact Gymistan to buy more.',
}
