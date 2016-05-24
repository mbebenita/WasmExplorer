var cppExamples = {
  "Q_rsqrt":  `float Q_rsqrt(float number) {
  long i;
  float x2, y;
  const float threehalfs = 1.5F;

  x2 = number * 0.5F;
  y  = number;
  i  = *(long *) &y;
  i  = 0x5f3759df - (i >> 1);
  y  = *(float *) &i;
  y  = y * (threehalfs - (x2 * y * y));
  y  = y * (threehalfs - (x2 * y * y));

  return y;
}`,
  "testFunction": `int testFunction(int* input, int length) {
  int sum = 0;
  for (int i = 0; i < length; ++i) {
    sum += input[i];
  }
  return sum;
}`,
  "fact": `double fact(int i) {
  long long n = 1;
  for (;i > 0; i--) {
    n *= i;
  }
  return (double)n;
}`,
  "virtual": `struct A {
  A();
  ~A();
  virtual void virtual_member_function();
};
 
A *ctor() {
  return new A();
}
void dtor(A *a) {
  delete a;
}
void call_member_function(A *a) {
  a->virtual_member_function();
}`,
  "popcnt": `int main(int a) {
  return __builtin_popcount(a) + 
         __builtin_popcount(a);
}

int count(unsigned int x) {
  int v = 0;
  while(x != 0) {
    x &= x - 1;
    v++;
  }
  return v;
}
`,"fast-math": `// compile with/without -ffast-math

double foo(double d) {
  return d / 3.0;
}

double maybe_min(double d, double e) {
  return d < e ? d : e;
}

double pow(double x, double y);
     
double call_pow(double x) {
  return pow(x, 8);
}
 
double do_pow(double x) {
  return x*x*x*x*x*x*x*x;
}
 
double factor(double a, double b, double c) {
  return (a * c) + (b * c);
}
`, "duff": `/**
  More expressive control flow constructs are needed to 
  implement Duff's device effectively.
  See: 
  https://github.com/WebAssembly/design/blob/master/FutureFeatures.md#more-expressive-control-flow
  */
void send(char *to, char *from, unsigned long count)
{
  unsigned long n = (count + 7) / 8;
  switch (count % 8) {
  case 0: do { *to++ = *from++;
  case 7:      *to++ = *from++;
  case 6:      *to++ = *from++;
  case 5:      *to++ = *from++;
  case 4:      *to++ = *from++;
  case 3:      *to++ = *from++;
  case 2:      *to++ = *from++;
  case 1:      *to++ = *from++;
    } while (--n > 0);
  }
}
`
}