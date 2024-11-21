class Calculator {
  constructor() {
    this.result = 0;
  }

  add(number) {
    this.result += number;
    return this;
  }

  subtract(number) {
    this.result -= number;
    return this;
  }

  multiply(number) {
    this.result *= number;
    return this;
  }

  divide(number) {
    if (number === 0) {
      throw new Error("Cannot divide by zero");
    }
    this.result /= number;
    return this;
  }

  modulus(number) {
    if (number === 0) {
      throw new Error("Cannot perform modulus by zero");
    }
    this.result %= number;
    return this;
  }

  getResult() {
    return this.result;
  }
}
