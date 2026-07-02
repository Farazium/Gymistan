from rest_framework import generics, filters, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import IntegrityError
from .models import Member
from .serializers import MemberSerializer, MemberListSerializer
from apps.accounts.permissions import IsGymMember
from apps.payments.models import Payment
import datetime


class MemberNextIdView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        existing = Member.objects.filter(
            gym=request.user.gym,
            member_id__isnull=False,
        ).exclude(member_id='').values_list('member_id', flat=True)
        ids = sorted([int(x) for x in existing if x.isdigit()])
        next_num = (max(ids) + 1) if ids else 1
        return Response({'next_id': str(next_num).zfill(4)})


class MemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['package', 'gender']
    ordering_fields = ['name', 'join_date', 'expiry_date']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return MemberListSerializer
        return MemberSerializer

    def get_queryset(self):
        qs = Member.objects.filter(gym=self.request.user.gym, is_deleted=False).select_related('package')

        status = self.request.query_params.get('status')
        today = datetime.date.today()
        if status == 'ACTIVE':
            qs = qs.filter(expiry_date__gt=today) | qs.filter(expiry_date__isnull=True)
        elif status == 'EXPIRED':
            qs = qs.filter(expiry_date__lte=today)

        search = self.request.query_params.get('search', '').strip()
        search_by = self.request.query_params.get('search_by', 'name')
        if search:
            field_map = {
                'name': 'name__icontains',
                'father_name': 'father_name__icontains',
                'phone': 'phone__icontains',
                'member_id': 'member_id__icontains',
            }
            lookup = field_map.get(search_by, 'name__icontains')
            qs = qs.filter(**{lookup: search})

        return qs

    def perform_create(self, serializer):
        try:
            member = serializer.save(gym=self.request.user.gym)
        except IntegrityError as e:
            err = str(e).lower()
            if 'phone' in err:
                raise serializers.ValidationError({'phone': 'A member with this phone number already exists'})
            raise serializers.ValidationError({'member_id': 'This Member ID is already occupied'})
        admission_fee = self.request.data.get('admission_fee')
        if admission_fee:
            try:
                fee = float(admission_fee)
                if fee > 0:
                    Payment.objects.create(
                        gym=self.request.user.gym,
                        member=member,
                        collected_by=self.request.user,
                        amount=fee,
                        amount_paid=fee,
                        status='PAID',
                        notes='Admission fee',
                    )
            except (ValueError, TypeError):
                pass


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MemberSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        return Member.objects.filter(gym=self.request.user.gym, is_deleted=False)

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save()


class DeletedMembersView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        members = Member.objects.filter(gym=request.user.gym, is_deleted=True).select_related('package')
        data = MemberListSerializer(members, many=True).data
        return Response(data)


class RestoreMemberView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            member = Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=True)
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        member.is_deleted = False
        if request.data.get('join_date'):
            member.join_date = request.data['join_date']
        if request.data.get('package'):
            from apps.packages.models import Package
            try:
                member.package = Package.objects.get(pk=request.data['package'], gym=request.user.gym)
            except Package.DoesNotExist:
                pass
        if request.data.get('expiry_date'):
            member.expiry_date = request.data['expiry_date']
        member.save()
        admission_fee = request.data.get('admission_fee')
        if admission_fee:
            try:
                fee = float(admission_fee)
                if fee > 0:
                    Payment.objects.create(
                        gym=request.user.gym,
                        member=member,
                        collected_by=request.user,
                        amount=fee,
                        amount_paid=fee,
                        status='PAID',
                        notes='Admission fee',
                    )
            except (ValueError, TypeError):
                pass
        return Response({'detail': 'Member restored'})


class HardDeleteMemberView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def delete(self, request, pk):
        try:
            member = Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=True)
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        member.delete()
        return Response(status=204)
