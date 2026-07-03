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

    e = _header_elements(gym)
    e.append(_band('', center_text='WELCOME TO THE FAMILY'))
    e.append(Spacer(1, 5 * mm))

    e.append(Paragraph(f'Welcome aboard, {name}!', greet))
    e.append(Spacer(1, 2 * mm))
    e.append(Paragraph(
        f"We're thrilled to have you join {gym.name}. Your membership is now active — "
        "let's make every session count. Here are your details:",
        msg,
    ))
    e.append(Spacer(1, 5 * mm))

    e.append(_details_table([
        ('Member ID', (member.member_id or '—') if member else '—',
         'Name', name),
        ('Phone', member.phone if member else '—',
         'Join Date', _fmt_date(member.join_date if member else None)),
        ('Package', pkg.name if pkg else '—',
         'Valid Till', _fmt_date(member.expiry_date if member else None)),
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


def send_whatsapp_slip(phone, member_name, gym_name, amount, status, pdf_url=None):
    token = settings.WHATSAPP_TOKEN
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID

    if not token or not phone_number_id:
        return False

    # Normalize Pakistani number to international format
    phone = phone.replace(' ', '').replace('-', '')
    if phone.startswith('0'):
        phone = '92' + phone[1:]
    elif not phone.startswith('92'):
        phone = '92' + phone

    message = (
        f"*{gym_name}*\n\n"
        f"Dear *{member_name}*,\n\n"
        f"Your payment of *PKR {amount:,.0f}* has been recorded.\n"
        f"Status: *{status}*\n\n"
        f"Thank you for being with us! 💪"
    )

    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message}
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code == 200
    except Exception:
        return False
