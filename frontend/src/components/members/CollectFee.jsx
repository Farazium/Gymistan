import { Wallet } from 'lucide-react'
import { fmtCurrency } from '../../utils/format'

/**
 * The "take the joining money now" block, shared by the add-member and restore
 * forms so the two can't drift apart. Both hand a member their first (or first
 * again) receipt, and both must do it as ONE payment: package fee, admission fee
 * and any balance the member walked out owing, settled in full or in part.
 *
 * The maths lives in `useJoiningPayment` because the form that owns the fields
 * needs the same numbers for its payload as this block needs to display.
 */
export function useJoiningPayment({ watch, pkgPrice = 0, carried = 0 }) {
  const collectFee = !!watch('collect_fee')
  const payType = watch('payment_type') || 'FULL'
  const admissionFee = Math.max(Number(watch('admission_fee') || 0), 0)
  const chargedNow = Number(pkgPrice || 0) + admissionFee
  const total = chargedNow + Number(carried || 0)
  // A balance was charged once already — only what's charged now can be discounted.
  const discount = Math.min(Math.max(Number(watch('discount') || 0), 0), chargedNow)
  const payable = Math.max(total - discount, 0)
  const enteredPaid = Number(watch('amount_paid') || 0)
  const amountPaid = payType === 'PARTIAL'
    ? Math.min(Math.max(enteredPaid, 0), payable)
    : payable
  return {
    collectFee, payType, admissionFee, pkgPrice: Number(pkgPrice || 0), carried: Number(carried || 0),
    chargedNow, total, discount, payable, enteredPaid, amountPaid,
    remaining: Math.max(payable - amountPaid, 0),
  }
}

export default function CollectFeeSection({ register, calc, pkgName, label }) {
  const { collectFee, payType, pkgPrice, admissionFee, carried, discount, payable, enteredPaid, amountPaid, remaining } = calc

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 select-none cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-green-500" {...register('collect_fee')} />
        <span className="text-sm text-gray-300 flex items-center gap-1.5">
          <Wallet size={14} className="text-primary-400" />
          {label || 'Collect first payment now (admission + package as one payment)'}
        </span>
      </label>

      {collectFee && (
        <div className="rounded-lg border border-primary-500/30 bg-primary-500/5 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer select-none transition ${payType === 'FULL' ? 'border-primary-500/60 bg-primary-500/10' : 'border-gray-600 hover:border-gray-500'}`}>
              <input type="radio" value="FULL" className="w-4 h-4 accent-primary-500" {...register('payment_type')} />
              <span className="text-sm text-gray-200">Full payment</span>
            </label>
            <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer select-none transition ${payType === 'PARTIAL' ? 'border-yellow-500/60 bg-yellow-500/10' : 'border-gray-600 hover:border-gray-500'}`}>
              <input type="radio" value="PARTIAL" className="w-4 h-4 accent-yellow-500" {...register('payment_type')} />
              <span className="text-sm text-gray-200">Partial payment</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Method</label>
              <select className="input" {...register('payment_method')}>
                <option value="CASH">Cash</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
            <div>
              <label className="label">Discount (PKR)</label>
              <input
                className="input"
                type="number"
                min="0"
                placeholder="0"
                onWheel={e => e.target.blur()}
                onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
                {...register('discount')}
              />
            </div>
          </div>

          {payType === 'PARTIAL' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Amount Paid (PKR) *</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max={payable || undefined}
                  onWheel={e => e.target.blur()}
                  onKeyDown={e => { if (['-', 'e', 'E', '+'].includes(e.key)) e.preventDefault() }}
                  {...register('amount_paid')}
                />
                {enteredPaid > payable && (
                  <p className="text-red-500 text-xs mt-1">Cannot exceed {fmtCurrency(payable)}</p>
                )}
              </div>
              <div>
                <label className="label">Remaining (PKR)</label>
                <input className="input opacity-70 cursor-not-allowed text-yellow-400" readOnly value={remaining} />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-600 divide-y divide-gray-700/60 text-sm bg-gray-900/30">
            <Row label={`Package fee${pkgName ? ` — ${pkgName}` : ''}`} value={fmtCurrency(pkgPrice)} />
            {admissionFee > 0 && <Row label="Admission fee" value={fmtCurrency(admissionFee)} />}
            {carried > 0 && <Row label="Previous dues" value={fmtCurrency(carried)} />}
            {discount > 0 && <Row label="Discount" value={`– ${fmtCurrency(discount)}`} valueClass="text-orange-400" />}
            <Row label="Total Paid" value={fmtCurrency(amountPaid)} bold labelClass="text-gray-200" valueClass="text-green-400" />
            {remaining > 0 && (
              <Row label="Remaining" value={fmtCurrency(remaining)} bold labelClass="text-yellow-400" valueClass="text-yellow-400" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold, labelClass = 'text-gray-400', valueClass = 'text-gray-200' }) {
  return (
    <div className={`flex justify-between px-3 py-2 ${bold ? 'font-semibold' : ''}`}>
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}
