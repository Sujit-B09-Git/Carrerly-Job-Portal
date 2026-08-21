package com.careerly.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.*;

@Entity @Table(name="users") @Getter @Setter @NoArgsConstructor
public class UserAccount {
  @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
  @Column(nullable=false, unique=true) private String email;
  @Column(name="password_hash", nullable=false) private String passwordHash;
  @Column(name="account_type", nullable=false) private String accountType;
  @Column(name="account_status", nullable=false) private String accountStatus="active";
  @Column(name="last_login_at") private Instant lastLoginAt;
  @Column(name="created_at", nullable=false, updatable=false) private Instant createdAt;
  @PrePersist void created(){ if(createdAt==null) createdAt=Instant.now(); }
}
