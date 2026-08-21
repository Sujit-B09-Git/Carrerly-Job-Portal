package com.careerly.model;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service class TokenService {
  private final SecretKey key; private final long expiration;
  TokenService(@Value("${careerly.jwt.secret}") String secret,@Value("${careerly.jwt.expiration-hours:8}") long hours){key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));expiration=hours;}
  String issue(UserAccount user, Long companyId){ JwtBuilder b=Jwts.builder().subject(user.getId().toString()).claim("accountType",user.getAccountType()).issuer("careerly-java").expiration(Date.from(Instant.now().plus(Duration.ofHours(expiration)))); if(companyId!=null)b.claim("companyId",companyId);return b.signWith(key).compact(); }
  Claims claims(String authorization){if(authorization==null||!authorization.startsWith("Bearer "))throw new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED,"Your session is invalid or has expired."); try{return Jwts.parser().verifyWith(key).build().parseSignedClaims(authorization.substring(7)).getPayload();}catch(JwtException e){throw new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED,"Your session is invalid or has expired.");}}
}
