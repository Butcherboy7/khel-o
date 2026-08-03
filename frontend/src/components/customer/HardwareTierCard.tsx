import { Monitor, Cpu, HardDrive, Zap, Tag } from 'lucide-react';
import { Card, CardContent, PriceDisplay, Badge, Button } from '@/components/ui';
import type { HardwareTier } from '@/types';

interface HardwareTierCardProps {
  tier: HardwareTier;
  onSelect?: (tier: HardwareTier) => void;
  isSelected?: boolean;
  selectable?: boolean;
}

export function HardwareTierCard({
  tier,
  onSelect,
  isSelected = false,
  selectable = false,
}: HardwareTierCardProps) {
  const discount = tier.activePromotion?.discountPercentage ?? 0;
  const finalPrice = discount > 0 ? tier.pricePerHour * (1 - discount / 100) : tier.pricePerHour;

  return (
    <Card
      elevation={isSelected ? 'raised' : 'resting'}
      className={`relative overflow-hidden transition-all duration-normal ${
        isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <CardContent className="p-5 flex flex-col justify-between h-full gap-4">
        {/* Header: Title + Preset Category */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-heading text-h3 text-text-primary">{tier.name}</h4>
            {tier.presetCategory && (
              <Badge variant="secondary" size="sm">
                {tier.presetCategory.replace('_', ' ')}
              </Badge>
            )}
          </div>
          {tier.description && (
            <p className="text-caption text-text-secondary line-clamp-2">{tier.description}</p>
          )}
        </div>

        {/* Spec Grid */}
        <div className="grid grid-cols-2 gap-2 text-caption bg-surface/60 p-3 rounded-xl">
          {tier.specs?.gpu && (
            <div className="flex items-center gap-1.5 text-text-primary">
              <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="font-semibold truncate">{tier.specs.gpu}</span>
            </div>
          )}
          {tier.specs?.cpu && (
            <div className="flex items-center gap-1.5 text-text-secondary">
              <Cpu className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
              <span className="truncate">{tier.specs.cpu}</span>
            </div>
          )}
          {tier.specs?.ram && (
            <div className="flex items-center gap-1.5 text-text-secondary">
              <HardDrive className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
              <span className="truncate">{tier.specs.ram}</span>
            </div>
          )}
          {tier.specs?.monitor && (
            <div className="flex items-center gap-1.5 text-text-secondary">
              <Monitor className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" />
              <span className="truncate">{tier.specs.monitor}</span>
            </div>
          )}
        </div>

        {/* Promotion Pill */}
        {discount > 0 && (
          <div className="flex items-center gap-1.5 text-caption font-semibold text-accent bg-accent/10 p-2 rounded-lg">
            <Tag className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{discount}% OFF Applied ({tier.activePromotion?.title})</span>
          </div>
        )}

        {/* Footer: Price & Selection */}
        <div className="flex items-center justify-between border-t border-border pt-3 mt-auto">
          <PriceDisplay
            amount={Math.round(finalPrice)}
            originalAmount={discount > 0 ? tier.pricePerHour : undefined}
            size="md"
          />

          {selectable && onSelect && (
            <Button
              variant={isSelected ? 'primary' : 'outline'}
              size="sm"
              onClick={() => onSelect(tier)}
            >
              {isSelected ? 'Selected' : 'Select Tier'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
