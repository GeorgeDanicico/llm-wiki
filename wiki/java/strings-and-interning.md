# String Identity, Literals, and Interning

The string pool is a canonicalization table, not a separate JVM runtime data area. String objects, including pooled strings, are heap objects. String literals and compile-time string constants are interned so equal literals can refer to the same canonical object. [JLS 3.10.5](https://docs.oracle.com/javase/specs/jls/se26/jls26.pdf) [JVMS 2.5](https://docs.oracle.com/javase/specs/jvms/se26/html/jvms-2.html#jvms-2.5) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)

`==` compares reference identity; it does not compare physical memory addresses. `String.equals()` compares character content. Use `equals()` when the question is whether two strings contain the same text. [String API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/lang/String.html)

```java
String a = "hello";
String b = "hello";
String c = new String("hello");

a == b          // true: same pooled object
a == c          // false: distinct String object
a.equals(c)     // true: same contents
c.intern() == a // true: returns the canonical pooled string
```

The `new String("hello")` expression creates an additional distinct string object using the pooled literal as its input. The distinction is useful in interviews: pooling can make references identical, but content equality does not depend on pooling. [String API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/lang/String.html) [Source](../../sources/notes/interview-preparation/java-interview-preparation-summary.md)
