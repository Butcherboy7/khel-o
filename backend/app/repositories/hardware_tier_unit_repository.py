from typing import List, Optional
from uuid import UUID, uuid4
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hardware_tier_unit import HardwareTierUnit, UnitStatus


class HardwareTierUnitRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_tier(self, tier_id: UUID) -> List[HardwareTierUnit]:
        result = await self.db.execute(
            select(HardwareTierUnit)
            .where(HardwareTierUnit.tier_id == tier_id)
            .order_by(HardwareTierUnit.created_at, HardwareTierUnit.label)
        )
        return list(result.scalars().all())

    async def get_by_id(self, unit_id: UUID) -> Optional[HardwareTierUnit]:
        result = await self.db.execute(select(HardwareTierUnit).where(HardwareTierUnit.id == unit_id))
        return result.scalars().first()

    async def count_in_maintenance(self, tier_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(HardwareTierUnit).where(
                HardwareTierUnit.tier_id == tier_id,
                HardwareTierUnit.status == UnitStatus.MAINTENANCE,
            )
        )
        return int(result.scalar() or 0)

    async def set_status(self, unit_id: UUID, status: UnitStatus) -> Optional[HardwareTierUnit]:
        result = await self.db.execute(select(HardwareTierUnit).where(HardwareTierUnit.id == unit_id))
        unit = result.scalars().first()
        if not unit:
            return None
        return await self.apply_status(unit, status)

    async def apply_status(self, unit: HardwareTierUnit, status: UnitStatus) -> HardwareTierUnit:
        """Same write as set_status, but for a caller that already holds the
        loaded unit (e.g. after its own ownership check) — skips the
        redundant re-SELECT set_status would otherwise do for a unit already
        in hand."""
        unit.status = status
        await self.db.commit()
        await self.db.refresh(unit)
        return unit

    async def sync_units_to_quantity(self, tier_id: UUID, quantity: int, label_prefix: str) -> List[HardwareTierUnit]:
        """Grow/shrink the tier's unit rows to match `quantity`, called after
        an owner creates an activity tier or changes its total_seats. Existing
        units (and their maintenance status) are preserved — growth appends
        new "{label_prefix} N" rows, shrinkage removes the highest-numbered
        rows first regardless of status (this is a quantity edit, not a
        targeted removal — an owner shrinking from 4 to 3 tables expects
        Table 4 to go away, not to be asked which one)."""
        existing = await self.list_by_tier(tier_id)
        if len(existing) < quantity:
            for i in range(len(existing) + 1, quantity + 1):
                unit = HardwareTierUnit(id=uuid4(), tier_id=tier_id, label=f"{label_prefix} {i}", status=UnitStatus.AVAILABLE)
                self.db.add(unit)
            await self.db.commit()
        elif len(existing) > quantity:
            for unit in existing[quantity:]:
                await self.db.delete(unit)
            await self.db.commit()
        return await self.list_by_tier(tier_id)
