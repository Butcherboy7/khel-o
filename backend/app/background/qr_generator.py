import io
import qrcode
from PIL import Image

def generate_booking_qr_code(booking_reference: str, cafe_id: str, booking_id: str) -> bytes:
    qr_data = f"khelo://booking?ref={booking_reference}&cafe={cafe_id}&id={booking_id}"
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
