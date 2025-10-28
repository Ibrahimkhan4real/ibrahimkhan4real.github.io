# Data Scientist

## About me


## Education
- BE, Mechanical Engineering | National University of Sciences and Technology (_2019 - 2023_)

## Work Experience
**AI Engineer @ CureMD (_July 2023 - Present_)**
- Developed an In-House "LLM for Code": Created an advanced in-house tool similar to GitHub Copilot. This tool, leveraging RAG with Mixtral 8x7B, is capable of code explanation, generation, and translation, significantly aiding in software development processes.
- Fine-Tuning LLMs for Specialized Applications: Fine-tuned LLMs on a proprietary code base to develop a chatbot specifically designed for software specialists.
- Chatbot Development for Customer Service: Utilized Retrieval Augmented Generation (RAG) with LLMs to develop a chatbot for the Customer Service Department.
- Automated Code Grading System: Implemented a LLM-based "Code Grader" using Mistral 7-B, which graded over 100+ candidates in under a minute. This system evaluates code based on logic and black-box testing.
- Enhancing Productivity with ML/DL Models: Employed machine learning and deep learning models to boost internal productivity and create innovative products tailored for the US Healthcare Industry.

## Projects

### Autonomous Laser Weeding Robot

**Project Overview:**
Developed an innovative agricultural robot designed to autonomously navigate and weed crop fields, utilizing advanced computer vision and laser technology.

**Key Features:**
- Advanced Weed Detection: Implemented a sophisticated computer vision algorithm to distinguish weeds from crops based on shape, size, and color. This ensures precise and accurate weed identification.
- Laser Elimination: Integrated a 10W Carbon laser that targets and eliminates weeds with a five-second exposure time, providing an efficient and eco-friendly alternative to chemical herbicides.
- Real-Time Verification: Utilized computer vision to confirm weed removal before resuming navigation, ensuring thorough and effective weeding.
- Novel Chassis Design: Engineered a unique chassis based on four-bar linkages, enhancing stability and mobility through various agricultural terrains.
- Autonomous Navigation: Developed and implemented a path planning algorithm for the robot to autonomously navigate crop fields, ensuring complete automation.
- Precision Actuation: Installed a CNC mechanism to accurately line up the laser on top of the weed, guaranteeing precise targeting and removal.

**Achievements:**
- Secured third place in Prime Minister's National Innovation Award 2023.
- Successfully designed and developed a fully autonomous system that integrates cutting-edge technologies in robotics, computer vision, and precision agriculture.
- Enhanced agricultural efficiency by providing a sustainable and environmentally friendly solution for weed management.
- Reduced dependency on chemical herbicides, promoting a more eco-friendly approach to farming.

## Updating the publications list

Run the helper script whenever you want to refresh the `papers` page with the latest entries from Google Scholar:

```bash
python scripts/update_papers.py --scholar-id bh9os08AAAAJ
```

The script regenerates `site_data/papers.json`, which the `papers.html` page reads at runtime. Commit the updated JSON file alongside any site changes before deploying.
