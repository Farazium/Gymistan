import io
import requests
from reportlab.lib.pagesizes import A5
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from django.conf import settings


def generate_payment_slip(payment):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A5, topMargin=10*mm, bottomMargin=10*mm,
                            leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('title', fontSize=16, alignment=TA_CENTER, fontName='Helvetica-Bold',
                                 textColor=colors.HexColor('#1a1a2e'))
    sub_style = ParagraphStyle('sub', fontSize=9, alignment=TA_CENTER, textColor=colors.grey)
    label_style = ParagraphStyle('label', fontSize=9, fontName='Helvetica-Bold')
    value_style = ParagraphStyle('value', fontSize=9)

    elements.append(Paragraph(payment.gym.name, title_style))
    elements.append(Paragraph('Payment Receipt', sub_style))
    if payment.gym.address:
        elements.append(Paragraph(payment.gym.address, sub_style))
    elements.append(Spacer(1, 8*mm))

    status_color = colors.green if payment.status == 'PAID' else colors.orange
    data = [
        ['Receipt #', f'#{payment.id:05d}'],
        ['Date', payment.payment_date.strftime('%d %b %Y')],
        ['Member', payment.member.name],
        ['Phone', payment.member.phone],
        ['Package', payment.package.name if payment.package else '-'],
        ['Month', payment.month or '-'],
        ['Amount', f'PKR {payment.amount:,.0f}'],
        ['Discount', f'PKR {payment.discount:,.0f}'],
        ['Amount Paid', f'PKR {payment.amount_paid:,.0f}'],
        ['Status', payment.status],
    ]

    table = Table(data, colWidths=[45*mm, 75*mm])
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#f8f9fa'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dee2e6')),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('TEXTCOLOR', (1, -1), (1, -1), status_color),
        ('FONTNAME', (1, -1), (1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 8*mm))
    elements.append(Paragraph('Thank you for your payment!', sub_style))

    doc.build(elements)
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
