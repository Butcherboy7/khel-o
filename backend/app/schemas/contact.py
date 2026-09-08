from pydantic import BaseModel, ConfigDict, EmailStr, Field


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class ContactMessageCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    category: str = Field(default="general", description="general | cafe_partner | booking")
    message: str = Field(..., min_length=10, max_length=4000)
    # Honeypot: real visitors never see or fill this field. Any value here
    # means a bot filled the form, so the request is silently accepted
    # and dropped rather than sent.
    company: str = Field(default="", max_length=200)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
