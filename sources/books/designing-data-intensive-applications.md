### Chapter 11
#### Reasoning about time

Time is often an overlooked thing when working with streams. But it is an important aspect, because usually it should not cause ambiguity the order in which something happened. Well, this is not easy, because in distributed systems there are many aspects that can affect the order, such as network failures, slow processing, queues, and so on. 

Confusion between event time (event timestamp) and processing time can lead to bad data and observability.

There are different types of windows 
- tumbling window - is fixed window and every event belongs to exactly one window.
- hopping window - is like multile tumbling windows, each after another, and 2 hopping windows can intersect.
- sliding window - which is a window which keeps the events for a period, and once they expire, they are removed from the sliding window.
- session window - there is no time, but they are grouped by a key, for example user session id.

#### Stream joins

##### Stream - Stream joins

The joins between 2 streams of events, based on some criteria.

##### Stream - Table joins (also called enrichment)

A join between a stream of events and database table, most likely for situations in which the stream of events require additional data for processing regarding the events. This can also be more complicated, because the join with the database would imply network calls which mean latency, which can affect the job. Some possibilities would be to have a local snapshot of the database on the disk of the job, in an index, or if it is small enough, it can be also stored in a hashmap.

#### Time dependence of joins

In data processing, the time is very important when processing streams, when you need to correlate a sequence of events, because due to the nature of distributed systems and messaging queues and partitions, the events may not arrive in the required order, making the job non deterministic. This is often happening in data warehouses, and the way to fix it is to add unique identifier for the changing dimension. This issue is called (Slowly changing dimension).

##### Fault Tolerance

Batch jobs handle easier the fault tolerance, the input cannot be altered, as its only in read mode, and if the job fails, there is no output, and the job can be restarted. Even though if the events in the job are processed more than once, in the successful output they will appear as if they were executed exactly once.

There is a problem with the streams, because they are receiving data continuosly. So a solution for making them fault tolerance is to divide the data into batches and process them like this