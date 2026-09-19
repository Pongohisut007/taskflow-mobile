import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      // LAB3: ตั้งใจทำให้พัง เพื่อพิสูจน์ว่า post { failure } ทำงาน
      expect(appController.getHello()).toBe('Goodbye World!');
    });
  });
});
