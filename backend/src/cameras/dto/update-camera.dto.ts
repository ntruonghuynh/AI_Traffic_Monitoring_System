import { PartialType } from '@nestjs/swagger';
import { CreateCameraDto } from './create-camera.dto';

export class UpdateCameraDto extends PartialType(CreateCameraDto) {}
