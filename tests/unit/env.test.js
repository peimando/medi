const { validateEnv } = require('../../src/config/env');

describe('validateEnv', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('exits with 1 if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = 'a'.repeat(32);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const con = jest.spyOn(console, 'error').mockImplementation(() => {});
    validateEnv();
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
    con.mockRestore();
  });

  test('exits with 1 if JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    delete process.env.JWT_SECRET;
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const con = jest.spyOn(console, 'error').mockImplementation(() => {});
    validateEnv();
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
    con.mockRestore();
  });

  test('exits with 1 if both required vars are missing', () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const con = jest.spyOn(console, 'error').mockImplementation(() => {});
    validateEnv();
    expect(exit).toHaveBeenCalledWith(1);
    expect(con).toHaveBeenCalledWith(
      '❌ Variables de entorno faltantes:',
      'DATABASE_URL, JWT_SECRET'
    );
    exit.mockRestore();
    con.mockRestore();
  });

  test('applies defaults for optional env vars', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'a'.repeat(32);
    delete process.env.PORT;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.CORS_ORIGIN;
    delete process.env.LOG_LEVEL;
    delete process.env.FRONTEND_URL;
    validateEnv();
    expect(process.env.PORT).toBe('3000');
    expect(process.env.REDIS_HOST).toBe('localhost');
    expect(process.env.REDIS_PORT).toBe('6379');
    expect(process.env.CORS_ORIGIN).toBe('');
    expect(process.env.LOG_LEVEL).toBe('info');
    expect(process.env.FRONTEND_URL).toBe('*');
  });

  test('does not override existing optional vars', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.PORT = '9999';
    validateEnv();
    expect(process.env.PORT).toBe('9999');
  });

  test('warns if JWT_SECRET is shorter than 32 chars', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'short';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));
    warn.mockRestore();
  });

  test('passes silently when all required vars are present', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/d';
    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(() => validateEnv()).not.toThrow();
  });
});
