import { HttpStatus, HttpCode, Body, Post, Controller } from '@nestjs/common';
import { LoginDto, RegisterDto } from 'src/dto/auth.dto';
import { AuthService } from 'src/services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.authService.register(registerDto);
    const { password, ...result } = user;

    return result;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async logic(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
