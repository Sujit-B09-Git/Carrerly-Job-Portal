# Careerly page names

| File | Purpose |
| --- | --- |
| `homepage.html` | Main Careerly home page and default server page |
| `candidate-registration.html` | Candidate and job seeker account registration |
| `candidate-profile.html` | Signed-in candidate profile, resume, career history, and completion dashboard |
| `login.html` | Shared sign-in page with Job Seeker and Recruiter/Employer selection |
| `employer-registration.html` | Company and recruiter registration and verification |
| `employer-login.html` | Dedicated employer portal sign-in |
| `about.html` | Careerly About Us page |

There is no separate `index.html`. When the Node.js server receives a request for `http://localhost:3000/`, it serves `homepage.html` automatically.
