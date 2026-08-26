---
layout: post
title: "From deadlines to decisions: a planning view of hot-water control"
description: "Why domestic hot-water control becomes a useful planning problem once deadlines, uncertainty and energy use are considered together."
---

A domestic hot-water heater looks simple: switch it on, wait, and switch it
off. The control problem becomes more interesting when the water must be ready
by a deadline, electricity conditions change, and unnecessary heating carries
a cost.
<!--more-->

This is one of the problems I use to study planning and reinforcement
learning. It is small enough to explain clearly, but still contains the parts
that make real control decisions difficult: delayed effects, uncertain demand,
constraints and competing objectives.

## Why the deadline matters

A controller that only reacts to the current temperature can miss the reason
for heating. The useful question is not simply “is the water cold?” It is:

> Which action now gives a good chance of meeting the required temperature at
> the required time without using more energy than necessary?

That phrasing changes the task from a thermostat rule into a planning problem.
The controller needs a model of how temperature evolves, a description of the
deadline and an objective that makes the trade-off explicit.

## What a planning controller considers

In a tree-search formulation, each branch represents a possible sequence of
future actions. Simulated trajectories estimate what could happen after those
actions, and the search allocates more attention to promising branches while
continuing to explore alternatives.

For this kind of study, the important pieces are:

- the state available to the controller;
- the actions it is allowed to take;
- the thermal model and uncertainty assumptions;
- the deadline and comfort requirement;
- the energy objective; and
- the baseline controllers used for comparison.

The algorithm name is only one part of the experiment. Without the rest of
that specification, it is difficult to tell what a result means or whether it
would reproduce.

## Comparing methods fairly

My public work examines planning and reinforcement-learning approaches,
including Monte Carlo Tree Search, PPO and SAC. A useful comparison keeps the
task, observations, action limits and evaluation conditions aligned. It also
reports failures and constraint violations rather than reducing everything to
one reward number.

This matters because different controllers can succeed in different ways. A
method may meet the deadline reliably but consume more energy; another may be
efficient on average but fail in difficult conditions. Those outcomes should
remain visible in the evaluation.

## Making the experiment auditable

I treat reproducibility as part of the research method rather than a final
cleanup step. In practice, that means recording configuration, seeds,
environment conditions and output summaries; checking that comparisons differ
only where intended; and keeping a clear route from a claim back to the run
that supports it.

The broader lesson is useful beyond hot water. When an AI controller acts over
time, the quality of the conclusion depends as much on the experimental design
as on the learning or planning algorithm.

You can read the public paper,
[“Deadline-Aware, Energy-Efficient Control of Domestic Immersion Hot Water Heaters”](https://arxiv.org/abs/2601.18123),
explore the [hot-water control repository](https://github.com/Ibrahimkhan4real/Hot_Water_Immersion_System),
or try the smaller planning examples on the [interactive demos page]({{ "/demos.html" | relative_url }}).
