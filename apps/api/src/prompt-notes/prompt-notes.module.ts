import { Module } from '@nestjs/common';
import { PromptNotesController } from './prompt-notes.controller';
import { PromptNotesService } from './prompt-notes.service';

@Module({
  controllers: [PromptNotesController],
  providers: [PromptNotesService],
})
export class PromptNotesModule {}
