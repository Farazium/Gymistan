import io
import os
import requests
from reportlab.lib.pagesizes import A5
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from django.conf import settings

# Brand palette (black)
BRAND = colors.HexColor('#111827')
BRAND_LIGHT = colors.HexColor('#F1F5F9')
INK = colors.HexColor('#0F172A')
MUTED = colors.HexColor('#64748B')
LINE = colors.HexColor('#E2E8F0')

# A5 = 148mm wide. With 12mm side margins the content width is 124mm.
CONTENT_W = 124 * mm


def _fmt_date(d):
    return d.strftime('%d %b %Y') if d else '—'


def _money(v):
    return f'PKR {v:,.0f}'


def _logo_flowable(gym, max_h_mm=42):
    """Return a reportlab Image for the gym logo, scaled big (~42mm tall, ~20% of
    the A5 height) while preserving aspect ratio. None if unavailable.

    `max_h_mm` shrinks it for a page that has more to fit — a welcome slip that
    doubles as a receipt would otherwise spill onto a second sheet."""
    if not gym.logo:
        return None
    try:
        path = gym.logo.path
    except (ValueError, NotImplementedError):
        return None
    if not os.path.exists(path):
        return None
    try:
        iw, ih = ImageReader(path).getSize()
        if not iw or not ih:
            return None
        max_h = max_h_mm * mm
        max_w = 80 * mm
        ratio = min(max_w / iw, max_h / ih)
        return Image(path, width=iw * ratio, height=ih * ratio)
    except Exception:
        return None


def _is_admission(payment):
    return (payment.notes or '').strip().lower() == 'admission fee'


def _is_joining(payment):
    """A payment taken while the member was being added or restored. The flag is
    what new records carry; the note is how the ones taken before it are known."""
    return bool(getattr(payment, 'is_joining', False)) or _is_admission(payment)


def _new_doc(buffer, title):
    return SimpleDocTemplate(
        buffer, pagesize=A5,
        topMargin=12 * mm, bottomMargin=12 * mm,
        leftMargin=12 * mm, rightMargin=12 * mm,
        title=title,
    )


# How roomy a slip is allowed to be. Each step down shrinks the logo, the cell
# padding and the gaps between blocks; `_render_one_page` walks the list until the
# whole thing lands on a single sheet. Anything the gym hands (or WhatsApps) to a
# member is a one-page document — a receipt that spills onto a second sheet reads
# as a printing fault, and a member's slip must never look broken.
LAYOUTS = [
    {'logo': 42, 'pad': 7, 'gap': 1.0},
    {'logo': 30, 'pad': 4.5, 'gap': 0.7},
    {'logo': 20, 'pad': 2.5, 'gap': 0.45},
]


def _render_one_page(title, build_elements):
    """Build a slip at the roomiest layout that still fits on one page.

    `build_elements(layout)` returns the flowables for one attempt; it is called
    afresh each time because reportlab consumes the flowables it draws."""
    buffer = None
    for i, layout in enumerate(LAYOUTS):
        buffer = io.BytesIO()
        doc = _new_doc(buffer, title)
        doc.build(build_elements(layout))
        if doc.page <= 1 or i == len(LAYOUTS) - 1:
            break
    buffer.seek(0)
    return buffer


def _header_elements(gym, logo_h_mm=42):
    """Shared branded header: big logo, gym name, address, contact."""
    gym_name = ParagraphStyle('gymName', fontSize=17, alignment=TA_CENTER,
                              fontName='Helvetica-Bold', textColor=INK, spaceBefore=4, leading=20)
    contact = ParagraphStyle('contact', fontSize=8.5, alignment=TA_CENTER,
                             textColor=MUTED, leading=12)
    e = []
    logo = _logo_flowable(gym, logo_h_mm)
    if logo:
        logo.hAlign = 'CENTER'
        e.append(logo)
    e.append(Paragraph(gym.name, gym_name))
    if gym.address:
        e.append(Paragraph(gym.address, contact))
    if gym.phone:
        e.append(Paragraph(f'Contact: {gym.phone}', contact))
    e.append(Spacer(1, 4 * mm))
    return e


def _footer_elements(lines):
    foot = ParagraphStyle('foot', fontSize=7.5, alignment=TA_CENTER, textColor=MUTED, leading=11)
    e = [
        Table([['']], colWidths=[CONTENT_W],
              style=[('LINEABOVE', (0, 0), (-1, -1), 0.5, LINE)]),
        Spacer(1, 2.5 * mm),
    ]
    for ln in lines:
        e.append(Paragraph(ln, foot))
    return e


def _details_table(rows, pad=6):
    """Each row is either a 4-tuple (label, value, label, value) for two side-by-side
    pairs, or a 2-tuple (label, value) for a single full-width field (value spans the
    remaining columns — good for long names)."""
    detail_data = []
    spans = []
    for i, r in enumerate(rows):
        if len(r) == 4:
            l1, v1, l2, v2 = r
            detail_data.append([l1.upper(), v1, l2.upper(), v2])
        else:
            label, value = r
            detail_data.append([label.upper(), value, '', ''])
            spans.append(('SPAN', (1, i), (3, i)))
    details = Table(detail_data, colWidths=[CONTENT_W * 0.2, CONTENT_W * 0.3,
                                            CONTENT_W * 0.22, CONTENT_W * 0.28])
    details.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTNAME', (3, 0), (3, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (0, -1), 7),
        ('FONTSIZE', (2, 0), (2, -1), 7),
        ('FONTSIZE', (1, 0), (1, -1), 9.5),
        ('FONTSIZE', (3, 0), (3, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), MUTED),
        ('TEXTCOLOR', (2, 0), (2, -1), MUTED),
        ('TEXTCOLOR', (1, 0), (1, -1), INK),
        ('TEXTCOLOR', (3, 0), (3, -1), INK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), pad),
        ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, LINE),
    ] + spans))
    return details


def _band(left_text, right_text=None, center_text=None):
    lbl = ParagraphStyle('bl', fontSize=11, alignment=TA_LEFT,
                         fontName='Helvetica-Bold', textColor=colors.white)
    rbl = ParagraphStyle('br', fontSize=11, alignment=TA_RIGHT,
                         fontName='Helvetica-Bold', textColor=colors.white)
    cbl = ParagraphStyle('bc', fontSize=13, alignment=TA_CENTER,
                         fontName='Helvetica-Bold', textColor=colors.white, leading=16)
    if center_text is not None:
        band = Table([[Paragraph(center_text, cbl)]], colWidths=[CONTENT_W])
    else:
        band = Table([[Paragraph(left_text, lbl), Paragraph(right_text or '', rbl)]],
                     colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
    band.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 10),
        ('RIGHTPADDING', (-1, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return band


def _amount_summary(payment, pad=7):
    """The money box: what was charged, what came off it, what was handed over and
    what is still owed.

    A joining payment that bundles the admission fee with the first package fee is
    broken back into its two lines — the whole point of taking it as one payment is
    that the member still sees exactly what they were charged for. A part-payment
    adds an amber balance line under the total."""
    amt_lbl = ParagraphStyle('al', fontSize=9, textColor=MUTED, fontName='Helvetica')
    amt_val = ParagraphStyle('av', fontSize=9, textColor=INK, alignment=TA_RIGHT, fontName='Helvetica')
    tot_lbl = ParagraphStyle('tl', fontSize=11, textColor=colors.white, fontName='Helvetica-Bold')
    tot_val = ParagraphStyle('tv', fontSize=13, textColor=colors.white, alignment=TA_RIGHT, fontName='Helvetica-Bold')
    due_fg = colors.HexColor('#B45309')
    due_lbl = ParagraphStyle('dl', fontSize=10, textColor=due_fg, fontName='Helvetica-Bold')
    due_val = ParagraphStyle('dv', fontSize=11, textColor=due_fg, alignment=TA_RIGHT, fontName='Helvetica-Bold')

    admission = payment.admission_amount or 0
    carried = payment.dues_amount or 0
    package_fee = (payment.amount or 0) - admission - carried

    def line(label, value):
        rows.append([Paragraph(label, amt_lbl), Paragraph(_money(value), amt_val)])

    rows = []
    if package_fee > 0:
        line('Package Fee' if (admission or carried) else 'Amount', package_fee)
    if admission > 0:
        line('Admission Fee', admission)
    if carried > 0:
        line('Previous Dues', carried)
    if not rows:
        line('Amount', payment.amount)
    rows.append([Paragraph('Discount', amt_lbl), Paragraph(f'– {_money(payment.discount)}', amt_val)])

    remaining = payment.remaining
    if remaining > 0:
        rows.append([Paragraph('Total Payable', amt_lbl), Paragraph(_money(payment.payable), amt_val)])
    total_row = len(rows)
    rows.append([Paragraph('TOTAL PAID', tot_lbl), Paragraph(_money(payment.amount_paid), tot_val)])
    if remaining > 0:
        rows.append([Paragraph('REMAINING', due_lbl), Paragraph(_money(remaining), due_val)])

    summary = Table(rows, colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
    style = [
        ('BACKGROUND', (0, 0), (-1, total_row - 1), BRAND_LIGHT),
        ('BACKGROUND', (0, total_row), (-1, total_row), BRAND),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), pad),
        ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, total_row - 2), 0.5, colors.white),
    ]
    if remaining > 0:
        style.append(('BACKGROUND', (0, total_row + 1), (-1, total_row + 1), colors.HexColor('#FEF3C7')))
    summary.setStyle(TableStyle(style))
    return summary


def _status_badge(payment):
    is_paid = payment.status == 'PAID'
    badge_bg = colors.HexColor('#DCFCE7') if is_paid else colors.HexColor('#FEF3C7')
    badge_fg = colors.HexColor('#15803D') if is_paid else colors.HexColor('#B45309')
    badge_style = ParagraphStyle('badge', fontSize=11, alignment=TA_CENTER,
                                 fontName='Helvetica-Bold', textColor=badge_fg)
    badge = Table([[Paragraph(f'● {payment.get_status_display().upper()}', badge_style)]],
                  colWidths=[40 * mm])
    badge.hAlign = 'CENTER'
    badge.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), badge_bg),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return badge


def generate_payment_slip(payment):
    """Joining payments get a warm welcome slip; everything else a receipt."""
    if _is_joining(payment) and payment.member:
        return generate_welcome_slip(payment.member, admission_payment=payment)
    return _generate_receipt_slip(payment)


def _generate_receipt_slip(payment):
    gym = payment.gym
    member = payment.member

    def build(layout):
        gap = layout['gap']
        e = _header_elements(gym, logo_h_mm=layout['logo'])
        e.append(_band('PAYMENT RECEIPT', f'Invoice #{payment.id:05d}'))
        e.append(Spacer(1, 4 * gap * mm))

        next_expiry = payment.new_expiry or (member.expiry_date if member else None)
        pkg = payment.package or (member.package if member else None)
        rows = [
            ('Member ID', (member.member_id or '—') if member else '—',
             'Name', member.name if member else '—'),
            ('Paid On', _fmt_date(payment.payment_date),
             'Mode of Payment', payment.get_payment_method_display()),
        ]
        if payment.is_dues_payment:
            # Settling an old balance buys no time, so an expiry pair here would
            # read like a renewal that never happened.
            rows.append(('Payment For', 'Outstanding Dues',
                         'Valid Till', _fmt_date(next_expiry)))
        else:
            rows.append(('Expired On', _fmt_date(payment.prev_expiry),
                         'Next Expiry Date', _fmt_date(next_expiry)))
            rows.append(('Package', pkg.name if pkg else '—'))
        e.append(_details_table(rows, pad=layout['pad'] - 1))
        e.append(Spacer(1, 4 * gap * mm))

        e.append(_amount_summary(payment, pad=layout['pad']))
        e.append(Spacer(1, 4 * gap * mm))

        e.append(_status_badge(payment))
        e.append(Spacer(1, 5 * gap * mm))

        footer = ['Thank you for your payment!']
        if payment.remaining > 0:
            footer.append(f'Dues of {_money(payment.remaining)} are still outstanding.')
        return e + _footer_elements(footer)

    return _render_one_page(f'Receipt #{payment.id:05d}', build)


def _welcome_greeting(name, gym_name, welcome_back):
    """Every word that differs between a first-time welcome and a rejoin: the banner,
    the two opening lines, and the closing tagline. Kept in one place so the two can't
    drift apart.

    Neither version claims the membership is active: a member is registered with an
    expired status until their first fee is paid."""
    if welcome_back:
        return (
            'WELCOME BACK',
            f'Great to have you back, {name}!',
            f"Let's pick up right where you left off at {gym_name}. Here are your details:",
            'Your fitness journey continues',
        )
    return (
        'WELCOME TO THE FAMILY',
        f'Welcome aboard, {name}!',
        f"We're thrilled to have you join {gym_name}. Here are your details:",
        'Your fitness journey starts now',
    )


def generate_welcome_slip(member, admission_payment=None, welcome_back=False):
    """The welcome PDF a member gets when they join or rejoin.

    One document for both routes: WhatsApp sends it, and downloading the admission
    payment's slip produces the very same page. Pass `admission_payment` when a fee
    was taken — that only adds the fee box, so the member and the gym are never
    looking at two different slips for the same event."""
    gym = member.gym
    pkg = member.package
    if admission_payment is None:
        rejoin = welcome_back
    else:
        rejoin = admission_payment.is_rejoin

    greet = ParagraphStyle('greet', fontSize=15, alignment=TA_CENTER, fontName='Helvetica-Bold',
                           textColor=INK, leading=19, spaceBefore=2)
    msg = ParagraphStyle('msg', fontSize=9.5, alignment=TA_CENTER, textColor=MUTED,
                         leading=14, spaceBefore=2)

    banner, line1, line2, tagline = _welcome_greeting(member.name, gym.name, rejoin)

    # Whether the first fee was collected at the desk decides what this page can
    # promise. Without it the membership is registered but expired, so there is no
    # "valid till" to print; with it the first cycle is already running.
    paid_up = admission_payment is not None and admission_payment.package is not None

    def build(layout):
        gap = layout['gap']
        e = _header_elements(gym, logo_h_mm=layout['logo'])
        e.append(_band('', center_text=banner))
        e.append(Spacer(1, 5 * gap * mm))

        e.append(Paragraph(line1, greet))
        # The second line of welcome is the first thing to go when the page also
        # has to carry a money box.
        if not paid_up:
            e.append(Spacer(1, 2 * gap * mm))
            e.append(Paragraph(line2, msg))
        e.append(Spacer(1, 5 * gap * mm))

        rows = [
            ('Member ID', member.member_id or '—', 'Name', member.name),
            ('Phone', member.phone or '—', 'Join Date', _fmt_date(member.join_date)),
            ('Package', pkg.name if pkg else '—'),
        ]
        if paid_up:
            expiry = admission_payment.new_expiry or member.expiry_date
            rows[2] = ('Package', pkg.name if pkg else '—', 'Valid Till', _fmt_date(expiry))
        elif admission_payment is not None:
            rows[2] = ('Package', pkg.name if pkg else '—',
                       'Admission Fee', _money(admission_payment.amount_paid))
        e.append(_details_table(rows, pad=layout['pad'] - 1))
        e.append(Spacer(1, 4 * gap * mm))

        # A joining payment that covered the package too is a receipt as much as a
        # welcome — it gets the same money box the receipt uses, so the member can
        # see exactly what the admission fee and the first fee were. No status
        # badge here: the box already prints the balance.
        if paid_up:
            e.append(_amount_summary(admission_payment, pad=layout['pad']))
            e.append(Spacer(1, 4 * gap * mm))

        e.append(_band('', center_text=tagline))
        e.append(Spacer(1, 6 * gap * mm))

        footer = ['See you at the gym!']
        if paid_up and admission_payment.remaining > 0:
            footer.append(f'Dues of {_money(admission_payment.remaining)} are still outstanding.')
        return e + _footer_elements(footer)

    return _render_one_page(f'Welcome {member.name}', build)


OUT_OF_CREDITS = 'WhatsApp message limit reached — top up to send more'


def _reserve_credit(gym):
    """Claim one prepaid credit before we spend anything at Meta. Reserving up front
    (rather than counting after) is what stops concurrent sends from overshooting a
    nearly-empty pack. Refund it with _refund_credit if the send doesn't land."""
    from apps.gyms.credits import reserve_wa_credit
    return reserve_wa_credit(gym)


def _refund_credit(gym):
    from apps.gyms.credits import refund_wa_credit
    try:
        refund_wa_credit(gym)
    except Exception:
        pass


def record_wa_usage(gym, category, wamid=None, recipient=''):
    """Log an accepted message against its reserved credit. Never raises — the audit
    row must not break a send that already happened.

    `wamid` is what the status webhook later matches on, so a row without one can
    never be told apart from a message that vanished. That only happens if Meta's
    response shape surprises us; the row is still written for billing."""
    try:
        from apps.gyms.models import WhatsAppUsage
        if gym:
            WhatsAppUsage.objects.create(gym=gym, category=category,
                                         wamid=wamid or None, recipient=recipient)
    except Exception:
        pass


def _wa_param(value, fallback='—'):
    """Make a value safe to hand Meta as a template parameter. It rejects an empty
    string outright, and rejects newlines, tabs or long runs of spaces inside one —
    which an imported member name can easily carry. Collapse the whitespace and
    fall back when nothing is left."""
    text = ' '.join(str(value or '').split())
    return text or fallback


def _normalize_pk_phone(phone):
    """Turn a locally-typed Pakistani number into WhatsApp's international format."""
    phone = (phone or '').replace(' ', '').replace('-', '').replace('+', '')
    if phone.startswith('0'):
        phone = '92' + phone[1:]
    elif not phone.startswith('92'):
        phone = '92' + phone
    return phone


def _wa_url(path):
    return f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{path}"


def _upload_pdf_media(pdf_buffer, filename, token, phone_number_id):
    """Upload the generated PDF to WhatsApp and return its media id (or None)."""
    files = {'file': (filename, pdf_buffer, 'application/pdf')}
    data = {'messaging_product': 'whatsapp', 'type': 'application/pdf'}
    headers = {'Authorization': f'Bearer {token}'}
    try:
        r = requests.post(_wa_url(f'{phone_number_id}/media'),
                          headers=headers, data=data, files=files, timeout=30)
    except Exception as e:
        return None, str(e)
    if r.status_code == 200:
        return r.json().get('id'), None
    return None, r.text


def send_whatsapp_slip(payment):
    """Send the branded payment PDF to the member as a WhatsApp document, wrapped in
    the approved receipt template (`WHATSAPP_TEMPLATE_NAME`, currently
    payment_receipt_v2). Returns (success: bool, detail: str)."""
    token = settings.WHATSAPP_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    if not token or not phone_number_id:
        return False, 'WhatsApp is not configured'

    member = payment.member
    if not member or not member.phone:
        return False, 'Member has no phone number'

    if not _reserve_credit(payment.gym):
        return False, OUT_OF_CREDITS

    phone = _normalize_pk_phone(member.phone)
    filename = f'receipt_{payment.id:05d}.pdf'

    # 1. Build the same PDF the download button produces
    pdf_buffer = generate_payment_slip(payment)

    # 2. Upload it to WhatsApp -> media id
    media_id, err = _upload_pdf_media(pdf_buffer, filename, token, phone_number_id)
    if not media_id:
        _refund_credit(payment.gym)
        return False, f'PDF upload failed: {err}'

    # 3. Send the template with the PDF as the document header.
    #    Body params, in the template's order: who paid, how much, which gym, and
    #    how long they are covered for. The gym name stays in the body because
    #    members see the shared "Gymistan" sender, never their own gym's name.
    #    The expiry is read the way the PDF reads it, so the message and the
    #    document it carries can never disagree; _fmt_date prints an em dash when
    #    a payment renews nothing (an admission fee), which keeps the parameter
    #    non-empty — Meta rejects a blank one.
    expiry = payment.new_expiry or member.expiry_date
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
            "components": [
                {"type": "header", "parameters": [
                    {"type": "document",
                     "document": {"id": media_id, "filename": filename}}
                ]},
                {"type": "body", "parameters": [
                    {"type": "text", "text": _wa_param(member.name)},
                    {"type": "text", "text": f'{payment.amount_paid:,.0f}'},
                    {"type": "text", "text": _wa_param(payment.gym.name)},
                    {"type": "text", "text": _fmt_date(expiry)},
                ]},
            ],
        },
    }
    ok, detail, wamid = _send_wa_message(payload)
    if ok:
        record_wa_usage(payment.gym, 'RECEIPT', wamid=wamid, recipient=phone)
    else:
        _refund_credit(payment.gym)
    return ok, detail


def _wamid_of(response):
    """Pull Meta's message id out of a send response. Never raises: a send that
    worked must not be reported as failed just because the body read oddly."""
    try:
        return response.json()['messages'][0]['id']
    except Exception:
        return None


def _send_wa_message(payload):
    """POST a ready-built message payload to WhatsApp.

    Returns (success, detail, wamid). Success here only means Meta accepted the
    message — whether it reached the phone arrives later on the status webhook,
    keyed by the returned wamid."""
    token = settings.WHATSAPP_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    if not token or not phone_number_id:
        return False, 'WhatsApp is not configured', None
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    try:
        r = requests.post(_wa_url(f'{phone_number_id}/messages'),
                          json=payload, headers=headers, timeout=30)
    except Exception as e:
        return False, str(e), None
    if r.status_code != 200:
        return False, r.text, None
    return True, 'sent', _wamid_of(r)


def send_whatsapp_welcome(member, welcome_back=False, admission_payment=None):
    """Send the branded welcome PDF to a member via the `member_welcome` template.
    Pass the admission payment, if one was taken, so the member receives the same
    slip the gym can download rather than a fee-less variant of it."""
    token = settings.WHATSAPP_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    if not token or not phone_number_id:
        return False, 'WhatsApp is not configured'
    if not member or not member.phone:
        return False, 'Member has no phone number'
    if not _reserve_credit(member.gym):
        return False, OUT_OF_CREDITS

    phone = _normalize_pk_phone(member.phone)
    filename = f'welcome_{member.member_id or member.id}.pdf'

    pdf_buffer = generate_welcome_slip(member, admission_payment=admission_payment,
                                       welcome_back=welcome_back)
    media_id, err = _upload_pdf_media(pdf_buffer, filename, token, phone_number_id)
    if not media_id:
        _refund_credit(member.gym)
        return False, f'PDF upload failed: {err}'

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_WELCOME_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
            "components": [
                {"type": "header", "parameters": [
                    {"type": "document",
                     "document": {"id": media_id, "filename": filename}}
                ]},
                {"type": "body", "parameters": [
                    {"type": "text", "text": member.gym.name}
                ]},
            ],
        },
    }
    ok, detail, wamid = _send_wa_message(payload)
    if ok:
        record_wa_usage(member.gym, 'WELCOME', wamid=wamid, recipient=phone)
    else:
        _refund_credit(member.gym)
    return ok, detail


def send_whatsapp_expiry_reminder(member):
    """Send a text-only renewal reminder via the `membership_expiry_notice` template."""
    if not member or not member.phone:
        return False, 'Member has no phone number'
    if not _reserve_credit(member.gym):
        return False, OUT_OF_CREDITS
    phone = _normalize_pk_phone(member.phone)
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_REMINDER_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANG},
            "components": [
                {"type": "body", "parameters": [
                    {"type": "text", "text": member.name},
                    {"type": "text", "text": member.gym.name},
                    {"type": "text", "text": _fmt_date(member.expiry_date)},
                ]},
            ],
        },
    }
    ok, detail, wamid = _send_wa_message(payload)
    if ok:
        record_wa_usage(member.gym, 'REMINDER', wamid=wamid, recipient=phone)
    else:
        _refund_credit(member.gym)
    return ok, detail
