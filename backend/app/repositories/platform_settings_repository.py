from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.platform_setting import PlatformSetting


class PlatformSettingsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create(self) -> PlatformSetting:
        result = await self.db.execute(select(PlatformSetting).limit(1))
        settings = result.scalars().first()
        if settings:
            return settings
        settings = PlatformSetting()
        self.db.add(settings)
        await self.db.commit()
        await self.db.refresh(settings)
        return settings

    async def update(self, fields: dict) -> PlatformSetting:
        settings = await self.get_or_create()
        for key, value in fields.items():
            if value is not None:
                setattr(settings, key, value)
        await self.db.commit()
        await self.db.refresh(settings)
        return settings
