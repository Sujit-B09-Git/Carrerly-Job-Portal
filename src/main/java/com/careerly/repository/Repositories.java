package com.careerly.model;
import org.springframework.data.jpa.repository.*;
import java.util.*;
interface UserRepository extends JpaRepository<UserAccount,Long>{ Optional<UserAccount> findByEmailIgnoreCase(String email); }
interface CompanyRepository extends JpaRepository<Company,Long>{ }
interface CandidateProfileRepository extends JpaRepository<CandidateProfile,Long>{ Optional<CandidateProfile> findByUser_Id(Long userId); }
interface EmployerProfileRepository extends JpaRepository<EmployerProfile,Long>{ Optional<EmployerProfile> findByUser_Id(Long userId); }
interface CompanyDocumentRepository extends JpaRepository<CompanyDocument,Long>{ }
interface JobRepository extends JpaRepository<Job,Long>{ List<Job> findByStatus(String status); List<Job> findByCompanyId(Long companyId); }
interface JobApplicationRepository extends JpaRepository<JobApplication,Long>{ boolean existsByJobIdAndCandidateId(Long jobId,Long candidateId); List<JobApplication> findByJobCompanyId(Long companyId); }
