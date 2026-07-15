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


def _logo_flowable(gym):
    """Return a reportlab Image for the gym logo, scaled big (~55mm tall,
    ~26% of the A5 height) while preserving aspect ratio. None if unavailable."""
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
        max_h = 42 * mm
        max_w = 80 * mm
        ratio = min(max_w / iw, max_h / ih)
        return Image(path, width=iw * ratio, height=ih * ratio)
    except Exception:
        return None


def _is_admission(payment):
    return (payment.notes or '').strip().lower() == 'admission fee'


def _new_doc(buffer, title):
    return SimpleDocTemplate(
        buffer, pagesize=A5,
        topMargin=12 * mm, bottomMargin=12 * mm,
        leftMargin=12 * mm, rightMargin=12 * mm,
        title=title,
    )


def _header_elements(gym):
    """Shared branded header: big logo, gym name, address, contact."""
    gym_name = ParagraphStyle('gymName', fontSize=17, alignment=TA_CENTER,
                              fontName='Helvetica-Bold', textColor=INK, spaceBefore=4, leading=20)
    contact = ParagraphStyle('contact', fontSize=8.5, alignment=TA_CENTER,
                             textColor=MUTED, leading=12)
    e = []
    logo = _logo_flowable(gym)
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


def _details_table(rows):
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
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
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
    """Admission-fee payments get a warm welcome slip; everything else a receipt."""
    if _is_admission(payment):
        return _generate_welcome_slip(payment)
    return _generate_receipt_slip(payment)


def _generate_receipt_slip(payment):
    buffer = io.BytesIO()
    doc = _new_doc(buffer, f'Receipt #{payment.id:05d}')
    gym = payment.gym
    member = payment.member

    e = _header_elements(gym)
    e.append(_band('PAYMENT RECEIPT', f'Invoice #{payment.id:05d}'))
    e.append(Spacer(1, 4 * mm))

    next_expiry = payment.new_expiry or (member.expiry_date if member else None)
    pkg = payment.package or (member.package if member else None)
    e.append(_details_table([
        ('Member ID', (member.member_id or '—') if member else '—',
         'Name', member.name if member else '—'),
        ('Paid On', _fmt_date(payment.payment_date),
         'Mode of Payment', payment.get_payment_method_display()),
        ('Expired On', _fmt_date(payment.prev_expiry),
         'Next Expiry Date', _fmt_date(next_expiry)),
        ('Package', pkg.name if pkg else '—'),
    ]))
    e.append(Spacer(1, 4 * mm))

    # ---- Amount summary box ----
    amt_lbl = ParagraphStyle('al', fontSize=9, textColor=MUTED, fontName='Helvetica')
    amt_val = ParagraphStyle('av', fontSize=9, textColor=INK, alignment=TA_RIGHT, fontName='Helvetica')
    tot_lbl = ParagraphStyle('tl', fontSize=11, textColor=colors.white, fontName='Helvetica-Bold')
    tot_val = ParagraphStyle('tv', fontSize=13, textColor=colors.white, alignment=TA_RIGHT, fontName='Helvetica-Bold')

    summary = Table([
        [Paragraph('Amount', amt_lbl), Paragraph(_money(payment.amount), amt_val)],
        [Paragraph('Discount', amt_lbl), Paragraph(f'– {_money(payment.discount)}', amt_val)],
        [Paragraph('TOTAL PAID', tot_lbl), Paragraph(_money(payment.amount_paid), tot_val)],
    ], colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
    summary.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 1), BRAND_LIGHT),
        ('BACKGROUND', (0, 2), (-1, 2), BRAND),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.white),
    ]))
    e.append(summary)
    e.append(Spacer(1, 4 * mm))

    e.append(_status_badge(payment))
    e.append(Spacer(1, 5 * mm))

    e += _footer_elements([
        'Thank you for your payment!',
    ])

    doc.build(e)
    buffer.seek(0)
    return buffer


def _welcome_greeting(name, gym_name, welcome_back):
    """Banner + the two opening lines of a welcome slip. Shared by the member-based
    and payment-based slips so their wording can't drift apart.

    Neither version claims the membership is active: a member is registered with an
    expired status until their first fee is paid."""
    if welcome_back:
        return (
            'WELCOME BACK',
            f'Great to have you back, {name}!',
            f"Let's pick up right where you left off at {gym_name}. Here are your details:",
        )
    return (
        'WELCOME TO THE FAMILY',
        f'Welcome aboard, {name}!',
        f"We're thrilled to have you join {gym_name}. Here are your details:",
    )


def _generate_welcome_slip(payment):
    buffer = io.BytesIO()
    doc = _new_doc(buffer, f'Welcome #{payment.id:05d}')
    gym = payment.gym
    member = payment.member
    name = member.name if member else 'Member'
    pkg = payment.package or (member.package if member else None)

    greet = ParagraphStyle('greet', fontSize=15, alignment=TA_CENTER, fontName='Helvetica-Bold',
                           textColor=INK, leading=19, spaceBefore=2)
    msg = ParagraphStyle('msg', fontSize=9.5, alignment=TA_CENTER, textColor=MUTED,
                         leading=14, spaceBefore=2)

    banner, line1, line2 = _welcome_greeting(name, gym.name, payment.is_rejoin)

    e = _header_elements(gym)
    e.append(_band('', center_text=banner))
    e.append(Spacer(1, 5 * mm))

    e.append(Paragraph(line1, greet))
    e.append(Spacer(1, 2 * mm))
    e.append(Paragraph(line2, msg))
    e.append(Spacer(1, 5 * mm))

    # No expiry here — see generate_member_welcome_slip.
    e.append(_details_table([
        ('Member ID', (member.member_id or '—') if member else '—',
         'Name', name),
        ('Phone', member.phone if member else '—',
         'Join Date', _fmt_date(member.join_date if member else None)),
        ('Package', pkg.name if pkg else '—'),
    ]))
    e.append(Spacer(1, 4 * mm))

    # ---- Admission fee box (single highlighted row) ----
    fee_lbl = ParagraphStyle('fl', fontSize=11, textColor=colors.white, fontName='Helvetica-Bold')
    fee_val = ParagraphStyle('fv', fontSize=13, textColor=colors.white, alignment=TA_RIGHT, fontName='Helvetica-Bold')
    feebox = Table([[Paragraph('ADMISSION FEE PAID', fee_lbl),
                     Paragraph(_money(payment.amount_paid), fee_val)]],
                   colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
    feebox.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    e.append(feebox)
    e.append(Spacer(1, 6 * mm))

    e += _footer_elements([
        'Your fitness journey starts now. See you at the gym!',
    ])

    doc.build(e)
    buffer.seek(0)
    return buffer


def generate_member_welcome_slip(member, welcome_back=False):
    """Welcome PDF built straight from a Member (no payment needed) — used when a
    member is added or restored. `welcome_back=True` tweaks the wording for restores."""
    buffer = io.BytesIO()
    doc = _new_doc(buffer, f'Welcome {member.name}')
    gym = member.gym
    pkg = member.package

    greet = ParagraphStyle('greet', fontSize=15, alignment=TA_CENTER, fontName='Helvetica-Bold',
                           textColor=INK, leading=19, spaceBefore=2)
    msg = ParagraphStyle('msg', fontSize=9.5, alignment=TA_CENTER, textColor=MUTED,
                         leading=14, spaceBefore=2)

    banner, line1, line2 = _welcome_greeting(member.name, gym.name, welcome_back)

    e = _header_elements(gym)
    e.append(_band('', center_text=banner))
    e.append(Spacer(1, 5 * mm))

    e.append(Paragraph(line1, greet))
    e.append(Spacer(1, 2 * mm))
    e.append(Paragraph(line2, msg))
    e.append(Spacer(1, 5 * mm))

    # No expiry here: a member is registered with an expired status until their
    # first fee is paid, so "valid till" would just repeat the join date.
    e.append(_details_table([
        ('Member ID', member.member_id or '—', 'Name', member.name),
        ('Phone', member.phone or '—', 'Join Date', _fmt_date(member.join_date)),
        ('Package', pkg.name if pkg else '—'),
    ]))
    e.append(Spacer(1, 4 * mm))

    e.append(_band('', center_text='Your fitness journey starts now'))
    e.append(Spacer(1, 6 * mm))

    e += _footer_elements([
        'See you at the gym!',
    ])

    doc.build(e)
    buffer.seek(0)
    return buffer


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


def record_wa_usage(gym, category):
    """Log a delivered message against its reserved credit. Never raises — the
    audit row must not break delivery that already happened."""
    try:
        from apps.gyms.models import WhatsAppUsage
        if gym:
            WhatsAppUsage.objects.create(gym=gym, category=category)
    except Exception:
        pass


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
    the approved `payment_receipt` template. Returns (success: bool, detail: str)."""
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

    # 3. Send the template with the PDF as the document header
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
                    {"type": "text", "text": payment.gym.name}
                ]},
            ],
        },
    }
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    try:
        r = requests.post(_wa_url(f'{phone_number_id}/messages'),
                          json=payload, headers=headers, timeout=30)
    except Exception as e:
        _refund_credit(payment.gym)
        return False, str(e)
    if r.status_code == 200:
        record_wa_usage(payment.gym, 'RECEIPT')
        return True, 'sent'
    _refund_credit(payment.gym)
    return False, r.text


def _send_wa_message(payload):
    """POST a ready-built message payload to WhatsApp. Returns (success, detail)."""
    token = settings.WHATSAPP_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    if not token or not phone_number_id:
        return False, 'WhatsApp is not configured'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    try:
        r = requests.post(_wa_url(f'{phone_number_id}/messages'),
                          json=payload, headers=headers, timeout=30)
    except Exception as e:
        return False, str(e)
    return (True, 'sent') if r.status_code == 200 else (False, r.text)


def send_whatsapp_welcome(member, welcome_back=False):
    """Send the branded welcome PDF to a member via the `member_welcome` template."""
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

    pdf_buffer = generate_member_welcome_slip(member, welcome_back=welcome_back)
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
    ok, detail = _send_wa_message(payload)
    if ok:
        record_wa_usage(member.gym, 'WELCOME')
    else:
        _refund_credit(member.gym)
    return ok, detail


def send_whatsapp_expiry_reminder(member):
    """Send a text-only renewal reminder via the `membership_expiry_notice` template."""
    if not member or not member.phone:
        return False, 'Member has no phone number'
    if not _reserve_credit(member.gym):
        return False, OUT_OF_CREDITS
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalize_pk_phone(member.phone),
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
    ok, detail = _send_wa_message(payload)
    if ok:
        record_wa_usage(member.gym, 'REMINDER')
    else:
        _refund_credit(member.gym)
    return ok, detail
