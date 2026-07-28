import os
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

def generate_and_save_qr_code(booking_id: str, booking_reference: str, cafe_id: str, base_dir: str = "static/qr") -> str:
    os.makedirs(base_dir, exist_ok=True)
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
    file_path = os.path.join(base_dir, f"{booking_id}.png")
    img.save(file_path, format="PNG")
    return f"/static/qr/{booking_id}.png"
