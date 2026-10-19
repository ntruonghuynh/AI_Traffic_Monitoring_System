import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { EventQueryDto } from '../../detection-events/dto/event-query.dto';
import { EventStatsQueryDto } from './event-stats-query.dto';

describe('Stats and event query DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it('rejects an unsupported groupBy value', async () => {
    await expect(pipe.transform(
      { groupBy: 'month' },
      { type: 'query', metatype: EventStatsQueryDto },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('parses new event filters and rejects values outside their ranges', async () => {
    const dto = await pipe.transform(
      { cameraId: '11111111-1111-4111-8111-111111111111', hasPlate: 'false', minConfidence: '0.8' },
      { type: 'query', metatype: EventQueryDto },
    ) as EventQueryDto;
    expect(dto).toMatchObject({ hasPlate: false, minConfidence: 0.8 });

    await expect(pipe.transform(
      { minConfidence: '1.1' },
      { type: 'query', metatype: EventQueryDto },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform(
      { hasPlate: 'yes' },
      { type: 'query', metatype: EventQueryDto },
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
